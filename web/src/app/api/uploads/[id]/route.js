import { connection } from 'next/server';
import { prisma } from '@/lib/server/db';
import { isUuid } from '@/lib/server/filters';
import { IMMUTABLE_CACHE, jsonError, withErrors } from '@/lib/server/http';

/** GET /api/uploads/:id: one upload including its full data-quality report. */
export const GET = withErrors(async (_request, { params }) => {
  await connection();
  const { id } = await params;
  if (!isUuid(id)) return jsonError(400, 'Invalid upload id');

  const upload = await prisma.upload.findUnique({ where: { id } });
  if (!upload) return jsonError(404, 'Upload not found');
  return Response.json({ upload }, { headers: { 'cache-control': IMMUTABLE_CACHE } });
});
