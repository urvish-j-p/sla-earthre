/**
 * Parsing and validation of the logs-view query string, shared by the JSON
 * and CSV export endpoints so both always return the same rows.
 *
 *   from=YYYY-MM-DD        first UTC day (inclusive)
 *   to=YYYY-MM-DD          last UTC day (inclusive); omit for a single day
 *   service=svc-a,svc-b    services
 *   outcome=DOWN,UNKNOWN   outcomes
 *   flag=AGENT_CONFLICT    checks carrying any of these data-quality flags
 *   sort=asc|desc          by time
 *   page, pageSize         pagination (pageSize <= 200)
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTCOMES = new Set(['UP', 'DOWN', 'UNKNOWN']);
const DAY_MS = 24 * 3600 * 1000;

export class BadRequest extends Error {}

export const isUuid = (value) => UUID_RE.test(value ?? '');

const list = (value) =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function parseDay(value, name) {
  if (!DATE_RE.test(value)) throw new BadRequest(`"${name}" must be a date in YYYY-MM-DD format`);
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
    throw new BadRequest(`"${name}" is not a valid calendar date`);
  }
  return ms;
}

/** @returns {{ where: object, orderBy: object[], page: number, pageSize: number, sort: string }} */
export function parseCheckQuery(uploadId, searchParams, { maxPageSize = 200 } = {}) {
  const where = { uploadId };

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (from || to) {
    const start = parseDay(from ?? to, 'from');
    const end = parseDay(to ?? from, 'to') + DAY_MS; // exclusive upper bound
    if (end <= start) throw new BadRequest('"to" must be on or after "from"');
    where.checkedAt = { gte: new Date(start), lt: new Date(end) };
  }

  const services = list(searchParams.get('service')).map((s) => s.toLowerCase());
  if (services.length) where.serviceId = { in: services };

  const outcomes = list(searchParams.get('outcome')).map((s) => s.toUpperCase());
  const invalid = outcomes.filter((o) => !OUTCOMES.has(o));
  if (invalid.length) throw new BadRequest(`Unknown outcome(s): ${invalid.join(', ')}`);
  if (outcomes.length) where.outcome = { in: outcomes };

  const flags = list(searchParams.get('flag')).map((s) => s.toUpperCase());
  if (flags.some((f) => !/^[A-Z_]+$/.test(f))) throw new BadRequest('Invalid flag code');
  if (flags.length) where.flags = { hasSome: flags };

  const sort = searchParams.get('sort') === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(maxPageSize, Math.max(1, Number.parseInt(searchParams.get('pageSize') ?? '50', 10) || 50));

  return {
    where,
    orderBy: [{ checkedAt: sort }, { serviceId: 'asc' }],
    page,
    pageSize,
    sort,
  };
}

/** Serialise a Check row for JSON (BigInt id, Date). */
export function serializeCheck(c) {
  return {
    id: String(c.id),
    checkedAt: c.checkedAt.toISOString(),
    serviceId: c.serviceId,
    serviceName: c.serviceName,
    outcome: c.outcome,
    statusCode: c.statusCode,
    latencyMs: c.latencyMs,
    region: c.region,
    agents: c.agents,
    reportCount: c.reportCount,
    flags: c.flags,
    sources: c.sources,
  };
}
