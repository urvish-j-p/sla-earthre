import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeDashboard, detectIncidents, percentile } from './analytics.js';
import { creditFor } from './config.js';

const T0 = Date.parse('2025-04-30T22:00:00Z');
const SLOT = 15 * 60 * 1000;

/** Build a check series from a pattern string: "." UP, "X" DOWN, "u" UNKNOWN. */
const series = (pattern, serviceId = 'svc-a', start = T0) =>
  [...pattern].map((ch, i) => ({
    serviceId,
    serviceName: `${serviceId}-api`,
    checkedAt: start + i * SLOT,
    outcome: ch === 'X' ? 'DOWN' : ch === 'u' ? 'UNKNOWN' : 'UP',
    statusCode: ch === 'X' ? 503 : ch === 'u' ? null : 200,
    latencyMs: 100 + i,
  }));

describe('detectIncidents', () => {
  it('merges a flapping outage into one incident', () => {
    const { incidents, isolated } = detectIncidents(series('....XXX.XX..X.XX....'));
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0].failedChecks, 8);
    assert.equal(incidents[0].start, T0 + 4 * SLOT);
    assert.equal(incidents[0].end, T0 + 16 * SLOT); // last failure slot + 15 min
    assert.equal(isolated.length, 0);
  });

  it('keeps sparse noise as isolated failures', () => {
    // 3 failures, each 2 healthy checks apart: failure ratio 3/7 is not a majority
    const { incidents, isolated } = detectIncidents(series('..X..X..X....X...'));
    assert.equal(incidents.length, 0);
    assert.equal(isolated.length, 4);
  });

  it('needs at least three failures', () => {
    assert.equal(detectIncidents(series('...XX...')).incidents.length, 0);
    assert.equal(detectIncidents(series('...XXX...')).incidents.length, 1);
  });

  it('splits outages separated by 3+ healthy checks', () => {
    assert.equal(detectIncidents(series('XXX...XXX')).incidents.length, 2);
  });

  it('ignores UNKNOWN checks in the failure ratio', () => {
    assert.equal(detectIncidents(series('XuXuX')).incidents.length, 1);
  });
});

describe('computeDashboard', () => {
  // 8 slots straddling a month boundary: 30 Apr 22:00 -> 1 May 00:00
  const checks = series('XXX.....', 'svc-a');
  const window = { start: '2025-04-30T00:00:00Z', end: '2025-05-02T00:00:00Z' };
  const stats = computeDashboard(checks, window);

  it('computes availability, downtime and error budget', () => {
    const [svc] = stats.services;
    assert.equal(svc.availabilityPct, 62.5);
    assert.equal(svc.downtimeMinutes, 45);
    assert.equal(svc.breached, true);
    assert.equal(svc.incidentCount, 1);
    assert.equal(svc.coveragePct, 4.17); // 8 of 192 slots in 2 days
  });

  it('splits billing periods by calendar month and flags partial months', () => {
    assert.deepEqual(
      stats.billingPeriods.map((p) => [p.month, p.observedDays, p.partial]),
      [
        ['2025-04', 1, true],
        ['2025-05', 1, true],
      ],
    );
    assert.equal(stats.billingPeriods[0].services[0].availabilityPct, 62.5);
    assert.equal(stats.billingPeriods[1].services[0].up, 0); // nothing observed in May
    assert.equal(stats.billingPeriods[1].services[0].availabilityPct, null);
  });

  it('builds one heatmap cell per service per day', () => {
    assert.deepEqual(stats.daily.days, ['2025-04-30', '2025-05-01']);
    assert.equal(stats.daily.services[0].cells[0].down, 3);
  });
});

describe('creditFor', () => {
  it('applies the tier schedule with strict "below" thresholds', () => {
    assert.equal(creditFor(99.95), 0);
    assert.equal(creditFor(99.9), 0);
    assert.equal(creditFor(99.89), 10);
    assert.equal(creditFor(99.0), 10);
    assert.equal(creditFor(98.5), 25);
    assert.equal(creditFor(94), 100);
    assert.equal(creditFor(null), 0);
  });
});

describe('percentile', () => {
  it('uses nearest rank', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    assert.equal(percentile(v, 50), 5);
    assert.equal(percentile(v, 95), 10);
    assert.equal(percentile([], 95), null);
  });
});
