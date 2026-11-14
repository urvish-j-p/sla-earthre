import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { ValidationError, processCsv } from '../src/pipeline/index.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const HEADER = 'service_id,service_name,timestamp,status_code,latency,latency_unit,agent,region';
const csv = (...lines) => [HEADER, ...lines].join('\n');
const issue = (report, code) => report.issues.find((i) => i.code === code);

describe('processCsv: structural validation', () => {
  it('rejects an empty file', () => {
    assert.throws(() => processCsv(''), ValidationError);
  });

  it('rejects a file missing required columns', () => {
    assert.throws(() => processCsv('service_id,latency\nsvc-a,10'), /Missing required column\(s\): timestamp, status_code/);
  });

  it('rejects a header-only file', () => {
    assert.throws(() => processCsv(HEADER), /no data rows/);
  });

  it('rejects a file where every row is invalid', () => {
    assert.throws(() => processCsv(csv('svc-a,a,not-a-date,200,1,ms,agent-1,r')), /No valid rows/);
  });
});

describe('processCsv: cleaning rules', () => {
  const text = csv(
    // same slot, three ways: Z, +05:30 and epoch -> one check
    'svc-a,a-api,2025-05-08T10:00:00Z,200,100,ms,agent-1,ap-south-1',
    'svc-a,a-api,2025-05-08T15:30:00+05:30,200,100,ms,agent-1,ap-south-1',
    'svc-a,a-api,2025-05-08T10:00:00Z,200,120,ms,agent-2,ap-south-1',
    // invalid status from agent-1, valid from agent-2 -> UP, AGENT_CONFLICT
    'svc-a,a-api,2025-05-08T10:15:00Z,999,100,ms,agent-1,ap-south-1',
    'svc-a,a-api,2025-05-08T10:15:00Z,200,110,ms,agent-2,ap-south-1',
    // UP vs DOWN disagreement -> DOWN wins
    'svc-a,a-api,2025-05-08T10:30:00Z,200,100,ms,agent-1,ap-south-1',
    'svc-a,a-api,2025-05-08T10:30:00Z,503,900,ms,agent-2,ap-south-1',
    // seconds, missing and negative latency (rows out of order on purpose)
    'svc-b,b-api,2025-05-08T10:00:00Z,200,0.5,s,agent-1,ap-south-1',
    'svc-b,b-api,1746698400,200,,ms,agent-1,ap-south-1', // 2025-05-08T10:00 epoch, different latency -> distinct report
    'svc-b,B-API,2025-05-08T09:45:00Z,200,-5,ms,agent-1,ap-south-1',
    // rejected rows
    'svc-b,b-api,garbage,200,1,ms,agent-1,ap-south-1',
    ',x,2025-05-08T10:00:00Z,200,1,ms,agent-1,ap-south-1',
    'svc-b,b-api,2025-05-08T10:00:00Z,200',
  );
  const { checks, report } = processCsv(text, { now: NOW });
  const find = (svc, iso) => checks.find((c) => c.serviceId === svc && c.checkedAt === Date.parse(iso));

  it('produces exactly one check per (service, slot)', () => {
    assert.equal(checks.length, 5);
    assert.equal(report.totals.rowsReceived, 13);
    assert.equal(report.totals.rowsRejected, 3);
    assert.equal(report.totals.rowsAccepted, 10);
  });

  it('collapses duplicates and merges agents', () => {
    const c = find('svc-a', '2025-05-08T10:00:00Z');
    assert.equal(c.reportCount, 3);
    assert.deepEqual(c.agents, ['agent-1', 'agent-2']);
    assert.equal(c.outcome, 'UP');
    assert.equal(c.latencyMs, 110); // mean of 100 (deduped) and 120
    assert.ok(c.flags.includes('DUPLICATE_ROW'));
    assert.ok(c.flags.includes('MULTI_AGENT'));
    assert.ok(c.flags.includes('TIMESTAMP_TZ_OFFSET'));
    assert.equal(c.sources.length, 3);
  });

  it('lets a valid status beat an invalid one', () => {
    const c = find('svc-a', '2025-05-08T10:15:00Z');
    assert.equal(c.outcome, 'UP');
    assert.equal(c.statusCode, 200);
    assert.ok(c.flags.includes('AGENT_CONFLICT'));
  });

  it('resolves UP vs DOWN disagreement as DOWN', () => {
    const c = find('svc-a', '2025-05-08T10:30:00Z');
    assert.equal(c.outcome, 'DOWN');
    assert.equal(c.statusCode, 503);
    assert.equal(c.latencyMs, 900);
  });

  it('normalises latency and keeps checks with bad latency for availability', () => {
    const c = find('svc-b', '2025-05-08T10:00:00Z');
    assert.equal(c.latencyMs, 500);
    const neg = find('svc-b', '2025-05-08T09:45:00Z');
    assert.equal(neg.latencyMs, null);
    assert.equal(neg.outcome, 'UP');
  });

  it('picks the most frequent service name as canonical', () => {
    assert.equal(find('svc-b', '2025-05-08T09:45:00Z').serviceName, 'b-api');
    assert.equal(issue(report, 'SERVICE_NAME_MISMATCH').count, 1);
  });

  it('reports every issue with counts and line-numbered samples', () => {
    assert.equal(issue(report, 'TIMESTAMP_INVALID').count, 1);
    assert.equal(issue(report, 'TIMESTAMP_INVALID').samples[0].line, 12);
    assert.equal(issue(report, 'MISSING_SERVICE').count, 1);
    assert.equal(issue(report, 'MALFORMED_ROW').count, 1);
    assert.equal(issue(report, 'TIMESTAMP_EPOCH').count, 1);
    assert.equal(issue(report, 'LATENCY_UNIT_SECONDS').count, 1);
    assert.equal(issue(report, 'LATENCY_MISSING').count, 1);
    assert.equal(issue(report, 'LATENCY_NEGATIVE').count, 1);
    assert.equal(issue(report, 'STATUS_INVALID').count, 1);
    assert.equal(issue(report, 'AGENT_CONFLICT').count, 2);
    assert.equal(issue(report, 'DUPLICATE_ROW').count, 1);
    assert.ok(issue(report, 'UNORDERED_ROWS').count >= 1);
    // errors first
    assert.equal(report.issues[0].severity, 'error');
  });

  it('infers the window from the data and reports coverage gaps', () => {
    assert.equal(report.window.start, '2025-05-08T00:00:00.000Z');
    assert.equal(report.window.days, 1);
    const a = report.services.find((s) => s.serviceId === 'svc-a');
    assert.equal(a.expectedSlots, 96);
    assert.equal(a.missingSlots, 93);
    assert.deepEqual(a.gaps[0], { start: '2025-05-08T00:00:00.000Z', end: '2025-05-08T10:00:00.000Z', slots: 40 });
  });
});

describe('processCsv: provided datasets', () => {
  const dataDir = new URL('../../data/', import.meta.url);
  const meta = JSON.parse(readFileSync(new URL('dataset_incident_log.json', dataDir), 'utf8'));

  for (const file of readdirSync(dataDir).filter((f) => f.endsWith('.csv'))) {
    it(`${file}: full coverage, one check per slot, window matches`, () => {
      const { checks, report } = processCsv(readFileSync(new URL(file, dataDir), 'utf8'), { now: NOW });
      const { days, start } = meta[file];
      assert.equal(report.window.days, days);
      assert.equal(report.window.start, `${start}T00:00:00.000Z`);
      assert.equal(checks.length, days * 96 * 5);
      assert.equal(report.totals.rowsRejected, 0);
      for (const s of report.services) assert.equal(s.coveragePct, 100);
    });
  }
});
