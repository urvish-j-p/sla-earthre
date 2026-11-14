import { connection } from 'next/server';
import { computeDashboard } from '@/lib/sla/analytics';
import { prisma } from '@/lib/server/db';
import { isUuid } from '@/lib/server/filters';
import { IMMUTABLE_CACHE, jsonError, withErrors } from '@/lib/server/http';

/**
 * GET /api/uploads/:id/stats: SLA, incident, billing and data-quality stats.
 *
 * Computed on read from the stored clean checks rather than precomputed at
 * ingest. The SLA policy (target, credit tiers, incident rule) can then change
 * without reprocessing files, and at ~15k rows per upload this takes
 * milliseconds. Responses are CDN-cacheable because uploads are immutable.
 */
export const GET = withErrors(async (_request, { params }) => {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) return jsonError(400, 'Invalid upload id');

  const upload = await prisma.upload.findUnique({
    where: { id },
    select: {
      id: true,
      fileName: true,
      status: true,
      windowStart: true,
      windowEnd: true,
      rowsReceived: true,
      rowsRejected: true,
      checksStored: true,
      processingMs: true,
      createdAt: true,
      qualityReport: true,
    },
  });
  if (!upload) return jsonError(404, 'Upload not found');
  if (upload.status !== 'COMPLETED') return jsonError(409, 'This upload failed validation and has no data');

  const checks = await prisma.check.findMany({
    where: { uploadId: id },
    select: { serviceId: true, serviceName: true, checkedAt: true, outcome: true, statusCode: true, latencyMs: true },
    orderBy: { checkedAt: 'asc' },
  });

  const stats = computeDashboard(checks, { start: upload.windowStart, end: upload.windowEnd });
  const { qualityReport, ...uploadMeta } = upload;

  return Response.json(
    {
      upload: uploadMeta,
      ...stats,
      quality: {
        totals: qualityReport?.totals ?? null,
        issues: (qualityReport?.issues ?? []).map(({ code, severity, label, action, count, samples }) => ({
          code,
          severity,
          label,
          action,
          count,
          samples,
        })),
      },
    },
    { headers: { 'cache-control': IMMUTABLE_CACHE } },
  );
});
