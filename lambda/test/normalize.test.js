import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCsv } from '../src/pipeline/csv.js';
import { parseLatency, parseStatus, parseTimestamp } from '../src/pipeline/normalize.js';

const NOW = Date.parse('2026-01-01T00:00:00Z');

describe('parseCsv', () => {
  it('handles CRLF, BOM, quotes, escaped quotes and blank lines', () => {
    const text = '﻿Service_ID ,b\r\n"svc-a","x, ""quoted"""\r\n\r\nsvc-b,y\r\n';
    const { header, rows } = parseCsv(text);
    assert.deepEqual(header, ['service_id', 'b']);
    assert.deepEqual(rows, [
      { line: 2, values: ['svc-a', 'x, "quoted"'] },
      { line: 4, values: ['svc-b', 'y'] },
    ]);
  });

  it('parses a file without a trailing newline', () => {
    assert.deepEqual(parseCsv('a,b\n1,2').rows, [{ line: 2, values: ['1', '2'] }]);
  });

  it('returns an empty result for empty input', () => {
    assert.deepEqual(parseCsv(''), { header: [], rows: [] });
  });
});

describe('parseTimestamp', () => {
  const at = (s) => new Date(parseTimestamp(s, NOW).ms).toISOString();

  it('accepts ISO-8601 UTC unchanged', () => {
    assert.deepEqual(parseTimestamp('2025-05-08T16:15:00Z', NOW), { ms: Date.parse('2025-05-08T16:15:00Z'), issues: [] });
  });

  it('converts IST (+05:30) offsets to UTC', () => {
    assert.equal(at('2025-05-09T20:00:00+05:30'), '2025-05-09T14:30:00.000Z');
    assert.deepEqual(parseTimestamp('2025-05-09T20:00:00+05:30', NOW).issues, ['TIMESTAMP_TZ_OFFSET']);
  });

  it('treats +00:00 as UTC without flagging', () => {
    assert.deepEqual(parseTimestamp('2025-05-09T20:00:00+00:00', NOW).issues, []);
  });

  it('converts epoch seconds and milliseconds', () => {
    assert.equal(at('1748729700'), '2025-05-31T22:15:00.000Z');
    assert.equal(at('1748729700000'), '2025-05-31T22:15:00.000Z');
    assert.deepEqual(parseTimestamp('1748729700', NOW).issues, ['TIMESTAMP_EPOCH']);
  });

  it('assumes UTC when there is no zone, and flags it', () => {
    assert.equal(at('2025-05-08 16:15'), '2025-05-08T16:15:00.000Z');
    assert.deepEqual(parseTimestamp('2025-05-08 16:15', NOW).issues, ['TIMESTAMP_NO_ZONE']);
  });

  it('snaps off-grid timestamps to the nearest 15-minute slot', () => {
    const r = parseTimestamp('2025-05-08T16:21:10Z', NOW);
    assert.equal(new Date(r.ms).toISOString(), '2025-05-08T16:15:00.000Z');
    assert.deepEqual(r.issues, ['TIMESTAMP_OFF_GRID']);
  });

  it('rejects garbage, calendar-invalid and implausible timestamps', () => {
    assert.deepEqual(parseTimestamp('yesterday', NOW), { error: 'TIMESTAMP_INVALID' });
    assert.deepEqual(parseTimestamp('', NOW), { error: 'TIMESTAMP_INVALID' });
    assert.deepEqual(parseTimestamp('2025-02-31T00:00:00Z', NOW), { error: 'TIMESTAMP_INVALID' });
    assert.deepEqual(parseTimestamp('1990-01-01T00:00:00Z', NOW), { error: 'TIMESTAMP_OUT_OF_RANGE' });
    assert.deepEqual(parseTimestamp('2030-01-01T00:00:00Z', NOW), { error: 'TIMESTAMP_OUT_OF_RANGE' });
  });
});

describe('parseStatus', () => {
  it('classifies outcomes', () => {
    assert.deepEqual(parseStatus('200'), { statusCode: 200, outcome: 'UP', issues: [] });
    assert.deepEqual(parseStatus('301'), { statusCode: 301, outcome: 'UP', issues: [] });
    assert.deepEqual(parseStatus('503'), { statusCode: 503, outcome: 'DOWN', issues: [] });
  });

  it('treats invalid codes and 4xx as UNKNOWN', () => {
    assert.deepEqual(parseStatus('999'), { statusCode: null, outcome: 'UNKNOWN', issues: ['STATUS_INVALID'] });
    assert.deepEqual(parseStatus(''), { statusCode: null, outcome: 'UNKNOWN', issues: ['STATUS_INVALID'] });
    assert.deepEqual(parseStatus('abc'), { statusCode: null, outcome: 'UNKNOWN', issues: ['STATUS_INVALID'] });
    assert.deepEqual(parseStatus('404'), { statusCode: 404, outcome: 'UNKNOWN', issues: ['STATUS_CLIENT_ERROR'] });
  });
});

describe('parseLatency', () => {
  it('normalises seconds to milliseconds without float noise', () => {
    assert.deepEqual(parseLatency('0.486', 's'), { latencyMs: 486, issues: ['LATENCY_UNIT_SECONDS'] });
    assert.deepEqual(parseLatency('258', 'ms'), { latencyMs: 258, issues: [] });
    assert.deepEqual(parseLatency('258', ' MS '), { latencyMs: 258, issues: [] });
  });

  it('flags missing, negative and unreadable latency', () => {
    assert.deepEqual(parseLatency('', 'ms'), { latencyMs: null, issues: ['LATENCY_MISSING'] });
    assert.deepEqual(parseLatency('-286', 'ms'), { latencyMs: null, issues: ['LATENCY_NEGATIVE'] });
    assert.deepEqual(parseLatency('fast', 'ms'), { latencyMs: null, issues: ['LATENCY_INVALID'] });
    assert.deepEqual(parseLatency('12', 'minutes'), { latencyMs: null, issues: ['LATENCY_INVALID'] });
  });
});
