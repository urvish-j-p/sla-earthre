/**
 * SLA policy. Kept in one place so the numbers the dashboard shows can be
 * traced to an explicit, reviewable rule.
 */
export const SLA_CONFIG = Object.freeze({
  /** Monthly availability commitment, in percent. */
  targetPct: 99.9,

  /** One health check every 15 minutes; each check stands for its whole slot. */
  slotMinutes: 15,

  /**
   * Credit schedule, evaluated per service per calendar month (the billing
   * period). The brief defines only the 99.9% threshold; the lower tiers follow
   * the common cloud-provider pattern and are an explicit assumption (see README).
   * Ordered from the lowest availability band to the highest.
   */
  creditTiers: Object.freeze([
    { belowPct: 95.0, creditPct: 100 },
    { belowPct: 99.0, creditPct: 25 },
    { belowPct: 99.9, creditPct: 10 },
  ]),

  /**
   * Incident detection. Outages in this data flap: 5xx bursts with the odd
   * healthy check in between, and services also have background noise of
   * isolated failures. A run of failed checks becomes an incident when:
   *  - each failure is within `maxHealthyGap` healthy checks of the previous one,
   *  - the run has at least `minFailedChecks` failures, and
   *  - failures are the majority (> minFailureRatio) of checks in the run's span.
   * Failures outside incidents are "isolated failures". They still count as
   * downtime for the SLA (the customer saw a 5xx), but they do not page anyone.
   */
  incident: Object.freeze({
    maxHealthyGap: 2,
    minFailedChecks: 3,
    minFailureRatio: 0.5,
  }),
});

/** Credit owed for a given availability, in percent of the monthly bill. */
export function creditFor(availabilityPct, tiers = SLA_CONFIG.creditTiers) {
  if (availabilityPct === null || availabilityPct === undefined) return 0;
  const tier = tiers.find((t) => availabilityPct < t.belowPct);
  return tier ? tier.creditPct : 0;
}
