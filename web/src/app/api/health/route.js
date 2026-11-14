import { connection } from 'next/server';
import { prisma } from '@/lib/server/db';

/** GET /api/health: liveness + database connectivity, for uptime checks. */
export async function GET() {
  await connection();
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, database: 'up', latencyMs: Date.now() - started });
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', msg: 'health check failed', error: err.message }));
    return Response.json({ ok: false, database: 'down' }, { status: 503 });
  }
}
