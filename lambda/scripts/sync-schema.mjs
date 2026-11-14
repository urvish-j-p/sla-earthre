/**
 * The Prisma schema has one source of truth: web/prisma/schema.prisma (the web
 * app also owns the migrations). The Lambda only needs it to generate its
 * client, so it is copied here before every `prisma generate`. The copy is
 * git-ignored.
 *
 * Why a copy instead of `--schema ../web/prisma/schema.prisma`: Prisma resolves
 * @prisma/client starting from the schema's folder, so pointing at another
 * package's schema would generate the client into that package.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../../web/prisma/schema.prisma', import.meta.url));
const destDir = fileURLToPath(new URL('../prisma/', import.meta.url));
mkdirSync(destDir, { recursive: true });
copyFileSync(src, `${destDir}schema.prisma`);
console.log('[sync-schema] copied web/prisma/schema.prisma -> lambda/prisma/schema.prisma');
