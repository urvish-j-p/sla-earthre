import { parseCsv } from './csv.js';
import { ISSUES, ISSUE_CODES as I } from './issues.js';
import { mergeSlot } from './merge.js';
import { KNOWN_COLUMNS, REQUIRED_COLUMNS, SLOT_MS, normalizeRow } from './normalize.js';

const DAY_MS = 24 * 3600 * 1000;
const MAX_SAMPLES = 5;
const MAX_GAPS_PER_SERVICE = 25;
const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 };

/** Error whose message is safe to show to the uploader (HTTP 4xx). */
export class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

/** Collects issue counts plus a few concrete examples for each. */
class IssueTracker {
  constructor() {
    this.byCode = new Map();
  }

  add(code, sample, n = 1) {
    let entry = this.byCode.get(code);
    if (!entry) {
      entry = { code, ...ISSUES[code], count: 0, samples: [] };
      this.byCode.set(code, entry);
    }
    entry.count += n;
    if (sample && entry.samples.length < MAX_SAMPLES) entry.samples.push(sample);
  }

  toJSON() {
    return [...this.byCode.values()].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count,
    );
  }
}

const iso = (ms) => new Date(ms).toISOString();

/**
 * The whole cleaning pipeline, as a pure function: CSV text in, clean checks +
 * data-quality report out. No I/O, so it is unit-testable and the Lambda
 * handler stays a thin adapter.
 *
 * @param {string} text raw CSV file contents
 * @param {{ now?: number }} [options]
 */
export function processCsv(text, { now = Date.now() } = {}) {
  const { header, rows } = parseCsv(text);

  // ---- 1. structural validation (fatal) ------------------------------------
  if (header.length === 0) throw new ValidationError('The file is empty.');
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) {
    throw new ValidationError(`Missing required column(s): ${missing.join(', ')}.`, {
      expected: KNOWN_COLUMNS,
      received: header,
    });
  }
  const dupes = header.filter((h, i) => header.indexOf(h) !== i);
  if (dupes.length) throw new ValidationError(`Duplicate column(s) in header: ${[...new Set(dupes)].join(', ')}.`);
  if (rows.length === 0) throw new ValidationError('The file has a header but no data rows.');

  const columns = Object.fromEntries(header.map((h, i) => [h, i]));
  const issues = new IssueTracker();

  // ---- 2. row-level normalisation ------------------------------------------
  const reports = [];
  let rowsRejected = 0;
  let cleanRows = 0;
  let outOfOrder = 0;
  let prevTs = -Infinity;

  for (const row of rows) {
    const result = normalizeRow(row, columns, header.length, now);
    if (!result.ok) {
      rowsRejected++;
      issues.add(result.issue, { line: result.line, raw: result.values.join(',') });
      continue;
    }
    const r = result.report;
    for (const code of r.issues) issues.add(code, { line: r.line, raw: row.values.join(',') });
    if (r.issues.length === 0) cleanRows++;
    if (r.checkedAt < prevTs) outOfOrder++;
    prevTs = r.checkedAt;
    reports.push(r);
  }

  if (reports.length === 0) {
    throw new ValidationError('No valid rows: every row was rejected.', { issues: issues.toJSON() });
  }
  if (outOfOrder > 0) issues.add(I.UNORDERED_ROWS, { detail: `${outOfOrder} rows are earlier than the row before them` }, outOfOrder);

  // ---- 3. canonical service names ------------------------------------------
  const nameCounts = new Map(); // serviceId -> Map(name -> count)
  for (const r of reports) {
    const m = nameCounts.get(r.serviceId) ?? new Map();
    m.set(r.serviceName, (m.get(r.serviceName) ?? 0) + 1);
    nameCounts.set(r.serviceId, m);
  }
  const canonicalName = new Map();
  for (const [serviceId, m] of nameCounts) {
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    canonicalName.set(serviceId, sorted[0][0]);
    for (const [name, count] of sorted.slice(1)) {
      issues.add(I.SERVICE_NAME_MISMATCH, { detail: `${serviceId}: "${name}" used ${count}x, canonical "${sorted[0][0]}"` }, count);
    }
  }

  // ---- 4. merge to one check per (service, slot) ---------------------------
  const groups = new Map();
  for (const r of reports) {
    const key = `${r.serviceId}|${r.checkedAt}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  const checks = [];
  for (const group of groups.values()) {
    const { check, mergeIssues } = mergeSlot(group);
    check.serviceName = canonicalName.get(check.serviceId);
    for (const [code, n] of Object.entries(mergeIssues)) {
      issues.add(code, { serviceId: check.serviceId, checkedAt: iso(check.checkedAt), lines: group.map((g) => g.line) }, n);
    }
    checks.push(check);
  }
  checks.sort((a, b) => a.checkedAt - b.checkedAt || a.serviceId.localeCompare(b.serviceId));

  // ---- 5. infer the monitoring window from the data ------------------------
  // Whole UTC days covering every check: the spec says the range varies and
  // must be read from the data, never assumed.
  const minTs = checks[0].checkedAt;
  const maxTs = checks.reduce((m, c) => Math.max(m, c.checkedAt), -Infinity);
  const windowStart = Math.floor(minTs / DAY_MS) * DAY_MS;
  const windowEnd = Math.floor(maxTs / DAY_MS) * DAY_MS + DAY_MS;
  const expectedSlots = (windowEnd - windowStart) / SLOT_MS;

  // ---- 6. coverage / gap detection per service ----------------------------
  const slotsByService = new Map();
  for (const c of checks) {
    const s = slotsByService.get(c.serviceId) ?? new Set();
    s.add(c.checkedAt);
    slotsByService.set(c.serviceId, s);
  }

  const services = [];
  for (const [serviceId, slots] of [...slotsByService.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const gaps = [];
    let missingCount = 0;
    let gapStart = null;
    for (let t = windowStart; t <= windowEnd; t += SLOT_MS) {
      const present = t === windowEnd || slots.has(t);
      if (!present) {
        missingCount++;
        if (gapStart === null) gapStart = t;
      } else if (gapStart !== null) {
        if (gaps.length < MAX_GAPS_PER_SERVICE) gaps.push({ start: iso(gapStart), end: iso(t), slots: (t - gapStart) / SLOT_MS });
        gapStart = null;
      }
    }
    if (missingCount > 0) {
      issues.add(I.COVERAGE_GAP, { serviceId, detail: `${missingCount} slot(s) missing`, gaps: gaps.slice(0, 3) }, missingCount);
    }
    services.push({
      serviceId,
      serviceName: canonicalName.get(serviceId),
      checks: slots.size,
      expectedSlots,
      missingSlots: missingCount,
      coveragePct: Math.round((slots.size / expectedSlots) * 100000) / 1000,
      gaps,
    });
  }

  const rowsReceived = rows.length;
  const report = {
    version: 1,
    file: {
      header,
      lineEnding: text.includes('\r\n') ? 'CRLF' : 'LF',
    },
    totals: {
      rowsReceived,
      rowsRejected,
      rowsAccepted: reports.length,
      cleanRows,
      cleanRowsPct: Math.round((cleanRows / rowsReceived) * 10000) / 100,
      checks: checks.length,
      rowsMergedAway: reports.length - checks.length,
    },
    window: {
      start: iso(windowStart),
      end: iso(windowEnd),
      days: (windowEnd - windowStart) / DAY_MS,
      slotMinutes: SLOT_MS / 60000,
      expectedSlotsPerService: expectedSlots,
    },
    services,
    issues: issues.toJSON(),
  };

  return { checks, report, window: { start: windowStart, end: windowEnd } };
}
