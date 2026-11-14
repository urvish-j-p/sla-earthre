/**
 * Catalogue of every data-quality issue the pipeline knows how to detect.
 *
 * Each issue has:
 *  - severity: "info"  -> normalised transparently, no impact on numbers
 *              "warn"  -> value changed or excluded from a metric; worth a look
 *              "error" -> row rejected, never reaches the database
 *  - action:   what the pipeline did about it (shown in the dashboard and README)
 *
 * Codes are persisted on each check (`checks.flags`), so they are part of the
 * public contract between the Lambda and the dashboard: rename with care.
 */
export const ISSUES = {
  // ---- file / row structure -------------------------------------------------
  MALFORMED_ROW: {
    severity: 'error',
    label: 'Malformed row',
    action: 'Row has the wrong number of columns. Rejected.',
  },
  MISSING_SERVICE: {
    severity: 'error',
    label: 'Missing service id',
    action: 'Row cannot be attributed to a service. Rejected.',
  },
  SERVICE_NAME_MISMATCH: {
    severity: 'warn',
    label: 'Inconsistent service name',
    action: 'Same service_id reported with different names. Canonical name = most frequent one.',
  },

  // ---- timestamps -----------------------------------------------------------
  TIMESTAMP_INVALID: {
    severity: 'error',
    label: 'Unparseable timestamp',
    action: 'Timestamp is in no recognised format. Rejected.',
  },
  TIMESTAMP_OUT_OF_RANGE: {
    severity: 'error',
    label: 'Implausible timestamp',
    action: 'Timestamp is before 2000 or in the future. Rejected.',
  },
  TIMESTAMP_EPOCH: {
    severity: 'info',
    label: 'Unix epoch timestamp',
    action: 'Converted from epoch seconds/milliseconds to ISO-8601 UTC.',
  },
  TIMESTAMP_TZ_OFFSET: {
    severity: 'info',
    label: 'Non-UTC timezone offset',
    action: 'Converted from local offset (e.g. +05:30) to UTC.',
  },
  TIMESTAMP_NO_ZONE: {
    severity: 'warn',
    label: 'Timestamp without timezone',
    action: 'No zone designator. Assumed UTC (the agents\' documented clock).',
  },
  TIMESTAMP_OFF_GRID: {
    severity: 'warn',
    label: 'Timestamp off the 15-min grid',
    action: 'Snapped to the nearest 15-minute slot.',
  },

  // ---- status ---------------------------------------------------------------
  STATUS_INVALID: {
    severity: 'warn',
    label: 'Invalid HTTP status',
    action: 'Not a real HTTP status (e.g. 999). Treated as UNKNOWN unless another agent reported a valid status for the same slot.',
  },
  STATUS_CLIENT_ERROR: {
    severity: 'warn',
    label: '4xx from health probe',
    action: 'A 4xx says the probe is misconfigured, not that the service is down. Treated as UNKNOWN.',
  },

  // ---- latency --------------------------------------------------------------
  LATENCY_UNIT_SECONDS: {
    severity: 'info',
    label: 'Latency reported in seconds',
    action: 'Converted to milliseconds.',
  },
  LATENCY_MISSING: {
    severity: 'warn',
    label: 'Missing latency',
    action: 'Check kept for availability; excluded from latency percentiles.',
  },
  LATENCY_NEGATIVE: {
    severity: 'warn',
    label: 'Negative latency',
    action: 'Physically impossible. Latency nulled; check kept for availability.',
  },
  LATENCY_INVALID: {
    severity: 'warn',
    label: 'Unreadable latency / unit',
    action: 'Non-numeric value or unknown unit. Latency nulled; check kept for availability.',
  },

  // ---- multi-row / multi-agent ----------------------------------------------
  DUPLICATE_ROW: {
    severity: 'info',
    label: 'Duplicate row',
    action: 'Same agent reported the same slot more than once with identical values. Collapsed to one.',
  },
  MULTI_AGENT: {
    severity: 'info',
    label: 'Multiple agents for one slot',
    action: 'Reports from several agents merged into one check, so a slot is never counted twice.',
  },
  AGENT_CONFLICT: {
    severity: 'warn',
    label: 'Agents disagree',
    action: 'Valid statuses beat invalid ones; if valid reports still disagree, DOWN wins (customer-favourable).',
  },

  // ---- dataset level --------------------------------------------------------
  UNORDERED_ROWS: {
    severity: 'info',
    label: 'Rows not in time order',
    action: 'Order is never assumed; checks are keyed by (service, slot).',
  },
  COVERAGE_GAP: {
    severity: 'warn',
    label: 'Missing check slots',
    action: 'Expected slot has no report. Excluded from availability (no evidence either way) and shown as coverage.',
  },
};

export const ISSUE_CODES = Object.freeze(Object.fromEntries(Object.keys(ISSUES).map((k) => [k, k])));
