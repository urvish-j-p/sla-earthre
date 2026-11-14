import { PrismaClient } from '@prisma/client';

/**
 * One PrismaClient per Lambda execution environment. It is created at module
 * scope, so warm invocations reuse the same connection instead of opening a new
 * one per request. DATABASE_URL should point at a pooled endpoint
 * (Neon -pooler / PgBouncer) with connection_limit=1.
 */
export const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG === 'query' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});
