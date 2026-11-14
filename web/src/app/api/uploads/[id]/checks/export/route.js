import { connection } from 'next/server';
import { prisma } from '@/lib/server/db';
import { isUuid, parseCheckQuery } from '@/lib/server/filters';
import { jsonError, withErrors } from '@/lib/server/http';

const MAX_EXPORT_ROWS = 50_000;
const COLUMNS = ['checked_at_utc', 'service_id', 'service_name', 'outcome', 'status_code', 'latency_ms', 'agents', 'report_count', 'flags'];

const cell = (v) => {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join('|') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** GET /api/uploads/:id/checks/export: the current logs filter as clean CSV (for billing/support hand-off). */
export const GET = withErrors(async (request, { params }) => {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) return jsonError(400, 'Invalid upload id');

  const { where, orderBy } = parseCheckQuery(id, new URL(request.url).searchParams);
  const rows = await prisma.check.findMany({
    where,
    orderBy,
    take: MAX_EXPORT_ROWS,
    select: { checkedAt: true, serviceId: true, serviceName: true, outcome: true, statusCode: true, latencyMs: true, agents: true, reportCount: true, flags: true },
  });

  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(
      [r.checkedAt.toISOString(), r.serviceId, r.serviceName, r.outcome, r.statusCode, r.latencyMs, r.agents, r.reportCount, r.flags]
        .map(cell)
        .join(','),
    );
  }

  return new Response(lines.join('\n') + '\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="checks-${id.slice(0, 8)}.csv"`,
    },
  });
});
