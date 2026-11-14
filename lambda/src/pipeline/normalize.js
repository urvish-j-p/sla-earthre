import { ISSUE_CODES as I } from './issues.js';

export const SLOT_MINUTES = 15;
export const SLOT_MS = SLOT_MINUTES * 60 * 1000;

/** Columns without which a row cannot be turned into an SLA data point. */
export const REQUIRED_COLUMNS = ['service_id', 'timestamp', 'status_code'];
export const KNOWN_COLUMNS = [
  'service_id',
  'service_name',
  'timestamp',
  'status_code',
  'latency',
  'latency_unit',
  'agent',
  'region',
];

const EARLIEST_PLAUSIBLE = Date.UTC(2000, 0, 1);
const LATENCY_UNIT_FACTORS = { ms: 1, s: 1000, sec: 1000, us: 0.001, 'µs': 0.001 };

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * Parse a timestamp in any of the formats seen in agent logs into epoch ms (UTC).
 * Supported: ISO-8601 with Z, ISO-8601 with an offset, ISO without zone (assumed
 * UTC), Unix epoch seconds (10 digits) and milliseconds (13 digits).
 *
 * @returns {{ ms: number, issues: string[] } | { error: string }}
 */
export function parseTimestamp(raw, now = Date.now()) {
  const value = (raw ?? '').trim();
  const issues = [];
  let ms;

  if (/^\d{10}$/.test(value)) {
    ms = Number(value) * 1000;
    issues.push(I.TIMESTAMP_EPOCH);
  } else if (/^\d{13}$/.test(value)) {
    ms = Number(value);
    issues.push(I.TIMESTAMP_EPOCH);
  } else {
    const m = ISO_RE.exec(value);
    if (!m) return { error: I.TIMESTAMP_INVALID };
    const [, y, mo, d, h, mi, s = '0', frac = '0', zone] = m;
    const fracMs = Math.round(Number(`0.${frac}`) * 1000);
    const local = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, fracMs);
    // Reject calendar-invalid values that Date.UTC would silently roll over (e.g. 2025-02-31).
    const check = new Date(local);
    if (
      check.getUTCFullYear() !== +y ||
      check.getUTCMonth() !== +mo - 1 ||
      check.getUTCDate() !== +d ||
      +h > 23 ||
      +mi > 59 ||
      +s > 59
    ) {
      return { error: I.TIMESTAMP_INVALID };
    }

    if (!zone) {
      ms = local;
      issues.push(I.TIMESTAMP_NO_ZONE);
    } else if (zone.toUpperCase() === 'Z') {
      ms = local;
    } else {
      const sign = zone[0] === '-' ? -1 : 1;
      const digits = zone.slice(1).replace(':', '');
      const offsetMin = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
      ms = local - offsetMin * 60 * 1000;
      if (offsetMin !== 0) issues.push(I.TIMESTAMP_TZ_OFFSET);
    }
  }

  if (!Number.isFinite(ms) || ms < EARLIEST_PLAUSIBLE || ms > now + 24 * 3600 * 1000) {
    return { error: I.TIMESTAMP_OUT_OF_RANGE };
  }

  const remainder = ms % SLOT_MS;
  if (remainder !== 0) {
    ms = Math.round(ms / SLOT_MS) * SLOT_MS;
    issues.push(I.TIMESTAMP_OFF_GRID);
  }
  return { ms, issues };
}

/**
 * Classify an HTTP status code from a health probe.
 *  2xx/3xx -> UP, 5xx -> DOWN, 4xx / garbage -> UNKNOWN.
 *
 * @returns {{ statusCode: number|null, outcome: 'UP'|'DOWN'|'UNKNOWN', issues: string[] }}
 */
export function parseStatus(raw) {
  const value = (raw ?? '').trim();
  const code = /^\d{3}$/.test(value) ? Number(value) : NaN;

  if (!(code >= 100 && code <= 599)) {
    return { statusCode: null, outcome: 'UNKNOWN', issues: [I.STATUS_INVALID] };
  }
  if (code >= 500) return { statusCode: code, outcome: 'DOWN', issues: [] };
  if (code >= 400) return { statusCode: code, outcome: 'UNKNOWN', issues: [I.STATUS_CLIENT_ERROR] };
  if (code >= 200) return { statusCode: code, outcome: 'UP', issues: [] };
  // 1xx informational: not a final answer from the service.
  return { statusCode: code, outcome: 'UNKNOWN', issues: [I.STATUS_INVALID] };
}

/**
 * Normalise a latency value + unit to milliseconds.
 * @returns {{ latencyMs: number|null, issues: string[] }}
 */
export function parseLatency(rawValue, rawUnit) {
  const value = (rawValue ?? '').trim();
  // A missing unit column/value defaults to ms, the unit used by most agents.
  const unit = (rawUnit ?? '').trim().toLowerCase() || 'ms';

  if (value === '') return { latencyMs: null, issues: [I.LATENCY_MISSING] };

  const num = Number(value);
  const factor = LATENCY_UNIT_FACTORS[unit];
  if (!Number.isFinite(num) || factor === undefined) {
    return { latencyMs: null, issues: [I.LATENCY_INVALID] };
  }
  if (num < 0) return { latencyMs: null, issues: [I.LATENCY_NEGATIVE] };

  const issues = factor === 1000 ? [I.LATENCY_UNIT_SECONDS] : [];
  // Round to microseconds to avoid float noise like 486.00000000000006
  return { latencyMs: Math.round(num * factor * 1000) / 1000, issues };
}

/**
 * Turn one raw CSV record into a normalised report, or a rejection.
 *
 * @param {{ line: number, values: string[] }} row
 * @param {Record<string, number>} columns header name -> index
 */
export function normalizeRow(row, columns, headerLength, now = Date.now()) {
  const { line, values } = row;
  const get = (name) => (columns[name] === undefined ? undefined : values[columns[name]]);

  if (values.length !== headerLength) {
    return { ok: false, line, values, issue: I.MALFORMED_ROW };
  }

  const serviceId = (get('service_id') ?? '').trim().toLowerCase();
  if (!serviceId) return { ok: false, line, values, issue: I.MISSING_SERVICE };

  const ts = parseTimestamp(get('timestamp'), now);
  if (ts.error) return { ok: false, line, values, issue: ts.error };

  const status = parseStatus(get('status_code'));
  const latency = parseLatency(get('latency'), get('latency_unit'));

  return {
    ok: true,
    report: {
      line,
      serviceId,
      serviceName: (get('service_name') ?? '').trim() || serviceId,
      checkedAt: ts.ms,
      statusCode: status.statusCode,
      outcome: status.outcome,
      latencyMs: latency.latencyMs,
      agent: (get('agent') ?? '').trim() || 'unknown-agent',
      region: (get('region') ?? '').trim() || null,
      issues: [...ts.issues, ...status.issues, ...latency.issues],
      raw: {
        timestamp: get('timestamp') ?? null,
        status_code: get('status_code') ?? null,
        latency: get('latency') ?? null,
        latency_unit: get('latency_unit') ?? null,
      },
    },
  };
}
