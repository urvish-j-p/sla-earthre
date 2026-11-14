/**
 * Builds build/lambda.zip: the handler source plus only the Prisma files the
 * Linux (rhel-openssl-3.0.x) runtime needs. Wasm/edge runtimes, other
 * databases' engines, source maps and the Windows engine are dropped, which
 * keeps the bundle around 20 MB instead of ~115 MB.
 *
 *   npm run package
 */
import AdmZip from 'adm-zip';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'build');
const outFile = join(outDir, 'lambda.zip');

const EXCLUDE = [
  /\.map$/,
  /\.d\.ts$/,
  /wasm/,
  /edge/,
  /react-native/,
  /[\\/]runtime[\\/]binary\./,
  /query_engine-windows/,
  /libquery_engine-(?!rhel-openssl-3\.0\.x)/, // any engine except the Lambda one
  /query_engine_bg/,
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const zip = new AdmZip();
let count = 0;
const add = (absPath) => {
  const rel = relative(root, absPath).split(sep).join('/'); // forward slashes: Lambda is Linux
  if (EXCLUDE.some((re) => re.test(rel))) return;
  const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  zip.addLocalFile(absPath, dir);
  count++;
};

for (const f of walk(join(root, 'src'))) add(f);
for (const f of walk(join(root, 'node_modules', '@prisma', 'client'))) add(f);
for (const f of walk(join(root, 'node_modules', '.prisma', 'client'))) add(f);

const engine = 'node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node';
if (!zip.getEntry(engine)) {
  throw new Error(`Missing ${engine}. Run "npm install" (it runs prisma generate) before packaging.`);
}

// Minimal package.json: ESM, no dependencies to install at runtime.
const { name, version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
zip.addFile('package.json', Buffer.from(JSON.stringify({ name, version, type: 'module' }, null, 2)));

mkdirSync(outDir, { recursive: true });
zip.writeZip(outFile);
console.log(`Packaged ${count} files -> ${relative(process.cwd(), outFile)} (${(statSync(outFile).size / 1048576).toFixed(1)} MB)`);
