import { PrismaClient } from '@prisma/client';

/**
 * One PrismaClient per Lambda execution environment. It is created at module
 * scope, so warm invocations reuse the same connection instead of opening a new
 * one per request. Prisma Postgres pools connections on its side.
 */
export const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG === 'query' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});
