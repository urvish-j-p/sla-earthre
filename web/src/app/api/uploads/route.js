import { connection } from 'next/server';
import { prisma } from '@/lib/server/db';
import { withErrors } from '@/lib/server/http';

/** GET /api/uploads: recent uploads (newest first) for the dataset picker. */
export const GET = withErrors(async (request) => {
  await connection();
  const status = new URL(request.url).searchParams.get('status');
  const uploads = await prisma.upload.findMany({
    where: status === 'all' ? {} : { status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      fileName: true,
      status: true,
      errorMessage: true,
      windowStart: true,
      windowEnd: true,
      rowsReceived: true,
      rowsRejected: true,
      checksStored: true,
      processingMs: true,
      createdAt: true,
    },
  });
  return Response.json({ uploads });
});
