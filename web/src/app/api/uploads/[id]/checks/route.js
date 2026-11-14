import { connection } from 'next/server';
import { prisma } from '@/lib/server/db';
import { isUuid, parseCheckQuery, serializeCheck } from '@/lib/server/filters';
import { IMMUTABLE_CACHE, jsonError, withErrors } from '@/lib/server/http';

/**
 * GET /api/uploads/:id/checks: paginated, filterable check records for the logs view.
 * See lib/server/filters.js for the query parameters.
 */
export const GET = withErrors(async (request, { params }) => {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) return jsonError(400, 'Invalid upload id');

  const { where, orderBy, page, pageSize } = parseCheckQuery(id, new URL(request.url).searchParams);

  const [items, outcomeCounts] = await Promise.all([
    prisma.check.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.check.groupBy({ by: ['outcome'], where, _count: { _all: true } }),
  ]);

  const summary = { UP: 0, DOWN: 0, UNKNOWN: 0 };
  for (const row of outcomeCounts) summary[row.outcome] = row._count._all;
  const total = summary.UP + summary.DOWN + summary.UNKNOWN;

  return Response.json(
    { items: items.map(serializeCheck), total, page, pageSize, summary },
    { headers: { 'cache-control': IMMUTABLE_CACHE } },
  );
});
