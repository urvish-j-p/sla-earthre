import { SLA_CONFIG, creditFor } from './config.js';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const round = (n, dp = 3) => (n === null || Number.isNaN(n) ? null : Math.round(n * 10 ** dp) / 10 ** dp);
const toMs = (d) => (d instanceof Date ? d.getTime() : typeof d === 'number' ? d : Date.parse(d));
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const isoMonth = (ms) => new Date(ms).toISOString().slice(0, 7);

/** Nearest-rank percentile of a pre-sorted numeric array. */
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

function latencyStats(values) {
  const sorted = values.filter((v) => v !== null && v !== undefined).sort((a, b) => a - b);
  return {
    samples: sorted.length,
    p50: round(percentile(sorted, 50), 1),
    p95: round(percentile(sorted, 95), 1),
    p99: round(percentile(sorted, 99), 1),
    max: sorted.length ? round(sorted[sorted.length - 1], 1) : null,
  };
}

/** Availability over the checks that carry evidence (UP or DOWN). UNKNOWN is excluded. */
function availability(up, down) {
  const measured = up + down;
  return measured === 0 ? null : round((up / measured) * 100, 4);
}

/**
 * Group a service's DOWN checks into incidents (see SLA_CONFIG.incident).
 * @param {Array<{checkedAt:number, outcome:string, statusCode:number|null, latencyMs:number|null}>} checks sorted by time
 */
export function detectIncidents(checks, config = SLA_CONFIG) {
  const { maxHealthyGap, minFailedChecks, minFailureRatio } = config.incident;
  const slotMs = config.slotMinutes * MINUTE;
  const maxStep = (maxHealthyGap + 1) * slotMs;

  // candidate clusters of DOWN checks close enough together
  const clusters = [];
  let current = null;
  checks.forEach((c, idx) => {
    if (c.outcome !== 'DOWN') return;
    if (current && c.checkedAt - checks[current.lastIdx].checkedAt <= maxStep) {
      current.lastIdx = idx;
      current.downIdx.push(idx);
    } else {
      current = { firstIdx: idx, lastIdx: idx, downIdx: [idx] };
      clusters.push(current);
    }
  });

  const incidents = [];
  const isolated = [];
  for (const cl of clusters) {
    const span = checks.slice(cl.firstIdx, cl.lastIdx + 1).filter((c) => c.outcome !== 'UNKNOWN');
    const failed = cl.downIdx.length;
    const ratio = failed / span.length;
    if (failed >= minFailedChecks && ratio > minFailureRatio) {
      const downs = cl.downIdx.map((i) => checks[i]);
      const statusCodes = {};
      for (const d of downs) statusCodes[d.statusCode ?? 'n/a'] = (statusCodes[d.statusCode ?? 'n/a'] ?? 0) + 1;
      const start = checks[cl.firstIdx].checkedAt;
      const end = checks[cl.lastIdx].checkedAt + slotMs; // a check covers its whole slot
      incidents.push({
        start,
        end,
        durationMinutes: (end - start) / MINUTE,
        failedChecks: failed,
        totalChecks: span.length,
        failureRatio: round(ratio, 3),
        downtimeMinutes: failed * config.slotMinutes,
        statusCodes,
        peakLatencyMs: latencyStats(span.map((c) => c.latencyMs)).max,
      });
    } else {
      for (const i of cl.downIdx) isolated.push(checks[i]);
    }
  }
  return { incidents, isolated };
}

/**
 * Everything the stats section needs, computed from the cleaned checks of one
 * upload. Pure and deterministic, so it is unit-tested against the answer key.
 *
 * @param {Array} rawChecks [{serviceId, serviceName, checkedAt, outcome, statusCode, latencyMs}]
 * @param {{ start: Date|string|number, end: Date|string|number }} window
 */
export function computeDashboard(rawChecks, window, config = SLA_CONFIG) {
  const windowStart = toMs(window.start);
  const windowEnd = toMs(window.end);
  const slot = config.slotMinutes;
  const budgetFraction = 1 - config.targetPct / 100;

  const checks = rawChecks
    .map((c) => ({ ...c, checkedAt: toMs(c.checkedAt) }))
    .sort((a, b) => a.checkedAt - b.checkedAt);

  const byService = new Map();
  for (const c of checks) {
    if (!byService.has(c.serviceId)) byService.set(c.serviceId, []);
    byService.get(c.serviceId).push(c);
  }

  const days = [];
  for (let t = windowStart; t < windowEnd; t += DAY) days.push(isoDay(t));
  const months = [...new Set(days.map((d) => d.slice(0, 7)))];
  const expectedPerService = (windowEnd - windowStart) / (slot * MINUTE);

  const services = [];
  const allIncidents = [];
  const daily = [];
  const billing = new Map(months.map((m) => [m, []]));

  for (const [serviceId, list] of [...byService.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const serviceName = list[0].serviceName;
    let up = 0;
    let down = 0;
    let unknown = 0;
    for (const c of list) {
      if (c.outcome === 'UP') up++;
      else if (c.outcome === 'DOWN') down++;
      else unknown++;
    }
    const availabilityPct = availability(up, down);
    const downtimeMinutes = down * slot;
    const allowedDowntimeMinutes = round((up + down) * slot * budgetFraction, 2);
    const { incidents, isolated } = detectIncidents(list, config);
    const last = list[list.length - 1];
    const lastDown = [...list].reverse().find((c) => c.outcome === 'DOWN');

    for (const inc of incidents) allIncidents.push({ serviceId, serviceName, ...inc });

    // ---- per day (heatmap) -------------------------------------------------
    const perDay = new Map(days.map((d) => [d, { up: 0, down: 0, unknown: 0, lat: [] }]));
    for (const c of list) {
      const cell = perDay.get(isoDay(c.checkedAt));
      if (!cell) continue;
      if (c.outcome === 'UP') cell.up++;
      else if (c.outcome === 'DOWN') cell.down++;
      else cell.unknown++;
      cell.lat.push(c.latencyMs);
    }
    daily.push({
      serviceId,
      serviceName,
      cells: days.map((date) => {
        const cell = perDay.get(date);
        return {
          date,
          up: cell.up,
          down: cell.down,
          unknown: cell.unknown,
          availabilityPct: availability(cell.up, cell.down),
          p95LatencyMs: latencyStats(cell.lat).p95,
        };
      }),
    });

    // ---- per billing month -------------------------------------------------
    for (const month of months) {
      const inMonth = list.filter((c) => isoMonth(c.checkedAt) === month);
      const mUp = inMonth.filter((c) => c.outcome === 'UP').length;
      const mDown = inMonth.filter((c) => c.outcome === 'DOWN').length;
      const mAvail = availability(mUp, mDown);
      billing.get(month).push({
        serviceId,
        serviceName,
        up: mUp,
        down: mDown,
        availabilityPct: mAvail,
        downtimeMinutes: mDown * slot,
        breached: mAvail !== null && mAvail < config.targetPct,
        creditPct: creditFor(mAvail, config.creditTiers),
      });
    }

    services.push({
      serviceId,
      serviceName,
      checks: list.length,
      expectedChecks: expectedPerService,
      coveragePct: round((list.length / expectedPerService) * 100, 2),
      up,
      down,
      unknown,
      availabilityPct,
      breached: availabilityPct !== null && availabilityPct < config.targetPct,
      downtimeMinutes,
      allowedDowntimeMinutes,
      budgetUsedPct: allowedDowntimeMinutes > 0 ? round((downtimeMinutes / allowedDowntimeMinutes) * 100, 1) : null,
      incidentCount: incidents.length,
      incidentDowntimeMinutes: incidents.reduce((s, i) => s + i.downtimeMinutes, 0),
      isolatedFailures: isolated.length,
      latency: latencyStats(list.map((c) => c.latencyMs)),
      lastCheck: { at: new Date(last.checkedAt).toISOString(), outcome: last.outcome },
      lastDownAt: lastDown ? new Date(lastDown.checkedAt).toISOString() : null,
    });
  }

  // ---- billing periods: calendar months, flagged when only partly observed --
  const billingPeriods = months.map((month) => {
    const [y, m] = month.split('-').map(Number);
    const monthStart = Date.UTC(y, m - 1, 1);
    const monthEnd = Date.UTC(y, m, 1);
    const observedStart = Math.max(monthStart, windowStart);
    const observedEnd = Math.min(monthEnd, windowEnd);
    const daysInMonth = (monthEnd - monthStart) / DAY;
    const observedDays = (observedEnd - observedStart) / DAY;
    return {
      month,
      start: new Date(observedStart).toISOString(),
      end: new Date(observedEnd).toISOString(),
      daysInMonth,
      observedDays,
      partial: observedDays < daysInMonth,
      monthlyBudgetMinutes: round(daysInMonth * 24 * 60 * budgetFraction, 2),
      services: billing.get(month),
    };
  });

  // ---- fleet KPIs ----------------------------------------------------------
  const totals = services.reduce(
    (t, s) => ({ up: t.up + s.up, down: t.down + s.down, unknown: t.unknown + s.unknown }),
    { up: 0, down: 0, unknown: 0 },
  );
  allIncidents.sort((a, b) => b.start - a.start);
  const durations = allIncidents.map((i) => i.durationMinutes);
  const creditLines = billingPeriods.flatMap((p) => p.services.filter((s) => s.creditPct > 0));
  const worst = [...services].sort((a, b) => (a.availabilityPct ?? 100) - (b.availabilityPct ?? 100))[0];

  return {
    config: {
      targetPct: config.targetPct,
      slotMinutes: slot,
      creditTiers: config.creditTiers,
      incident: config.incident,
    },
    window: {
      start: new Date(windowStart).toISOString(),
      end: new Date(windowEnd).toISOString(),
      days: days.length,
    },
    fleet: {
      services: services.length,
      servicesInBreach: services.filter((s) => s.breached).length,
      availabilityPct: availability(totals.up, totals.down),
      ...totals,
      downtimeMinutes: totals.down * slot,
      incidents: allIncidents.length,
      mttrMinutes: durations.length ? round(durations.reduce((a, b) => a + b, 0) / durations.length, 1) : null,
      longestIncidentMinutes: durations.length ? Math.max(...durations) : null,
      isolatedFailures: services.reduce((s, x) => s + x.isolatedFailures, 0),
      /** Share of failed checks that happened outside any incident: background error rate vs outages. */
      isolatedFailureSharePct: totals.down ? round((services.reduce((s, x) => s + x.isolatedFailures, 0) / totals.down) * 100, 1) : null,
      creditLines: creditLines.length,
      worstService: worst ? { serviceId: worst.serviceId, serviceName: worst.serviceName, availabilityPct: worst.availabilityPct } : null,
    },
    services,
    incidents: allIncidents.map((i, idx) => ({
      id: `${i.serviceId}-${i.start}`,
      rank: allIncidents.length - idx,
      ...i,
      start: new Date(i.start).toISOString(),
      end: new Date(i.end).toISOString(),
    })),
    billingPeriods,
    daily: { days, services: daily },
  };
}
