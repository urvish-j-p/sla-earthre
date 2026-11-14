import { ISSUE_CODES as I } from './issues.js';

const OUTCOME_SEVERITY = { DOWN: 2, UP: 1, UNKNOWN: 0 };

const mean = (nums) => (nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 1000) / 1000 : null);

/**
 * Merge every report for one (service, slot) into a single canonical check.
 *
 * Rules, in order:
 *  1. Same agent, identical status + latency    -> DUPLICATE_ROW, collapsed.
 *  2. Several agents                            -> MULTI_AGENT, merged.
 *  3. Outcome: reports with a known outcome (UP/DOWN) beat UNKNOWN ones.
 *     If known reports still disagree           -> AGENT_CONFLICT, DOWN wins.
 *     Rationale: SLA credits protect the customer; a confirmed 5xx from any
 *     agent is real evidence of an outage, a missing/invalid status is not.
 *  4. Status code is taken from a report that has the winning outcome.
 *  5. Latency = mean of valid latencies from reports with the winning outcome
 *     (agents are within ~25 ms of each other), falling back to any valid latency.
 *
 * @param {Array} reports normalised reports sharing serviceId + checkedAt
 * @returns {{ check: object, mergeIssues: Record<string, number> }}
 */
export function mergeSlot(reports) {
  const mergeIssues = {};
  const bump = (code, n = 1) => (mergeIssues[code] = (mergeIssues[code] ?? 0) + n);

  // 1. collapse exact duplicates per agent
  const distinct = [];
  for (const r of reports) {
    const twin = distinct.find(
      (d) => d.agent === r.agent && d.statusCode === r.statusCode && d.latencyMs === r.latencyMs && d.outcome === r.outcome,
    );
    if (twin) {
      bump(I.DUPLICATE_ROW);
      twin.duplicateLines.push(r.line);
    } else {
      distinct.push({ ...r, duplicateLines: [] });
    }
  }

  const agents = [...new Set(distinct.map((r) => r.agent))].sort();
  const flags = new Set(reports.flatMap((r) => r.issues));
  if (reports.length > distinct.length) flags.add(I.DUPLICATE_ROW);
  if (agents.length > 1) {
    flags.add(I.MULTI_AGENT);
    bump(I.MULTI_AGENT);
  }

  // 3. resolve outcome
  const known = distinct.filter((r) => r.outcome !== 'UNKNOWN');
  let outcome = 'UNKNOWN';
  if (known.length) {
    const outcomes = new Set(known.map((r) => r.outcome));
    outcome = [...outcomes].sort((a, b) => OUTCOME_SEVERITY[b] - OUTCOME_SEVERITY[a])[0];
    if (outcomes.size > 1 || known.length < distinct.length) {
      flags.add(I.AGENT_CONFLICT);
      bump(I.AGENT_CONFLICT);
    }
  } else if (new Set(distinct.map((r) => r.statusCode)).size > 1) {
    // all unknown but different garbage: still a disagreement worth flagging
    flags.add(I.AGENT_CONFLICT);
    bump(I.AGENT_CONFLICT);
  }

  const winners = distinct.filter((r) => r.outcome === outcome);
  const representative = winners[0] ?? distinct[0];
  const winnerLatencies = winners.map((r) => r.latencyMs).filter((v) => v !== null);
  const anyLatencies = distinct.map((r) => r.latencyMs).filter((v) => v !== null);

  const first = reports[0];
  return {
    mergeIssues,
    check: {
      serviceId: first.serviceId,
      serviceName: first.serviceName, // replaced by canonical name later
      checkedAt: first.checkedAt,
      outcome,
      statusCode: representative.statusCode,
      latencyMs: winnerLatencies.length ? mean(winnerLatencies) : mean(anyLatencies),
      region: representative.region,
      agents,
      reportCount: reports.length,
      flags: [...flags].sort(),
      sources: reports
        .slice()
        .sort((a, b) => a.line - b.line)
        .map((r) => ({
          line: r.line,
          agent: r.agent,
          region: r.region,
          ...r.raw,
          issues: r.issues,
        })),
    },
  };
}
