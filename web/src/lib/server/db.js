import 'server-only';
import { PrismaClient } from '@prisma/client';

/**
 * A single PrismaClient per server instance. In development, Next.js hot
 * reloading re-evaluates modules, so the client is cached on globalThis to
 * avoid exhausting database connections.
 */
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.__prisma = prisma;
