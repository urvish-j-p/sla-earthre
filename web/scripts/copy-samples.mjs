/**
 * Copies the provided sample datasets from ../data into public/samples so the
 * upload screen can offer one-click "try a sample" buttons. Runs before dev and
 * build; the copy is git-ignored so ../data stays the single source of truth.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../../data/', import.meta.url));
const dest = fileURLToPath(new URL('../public/samples/', import.meta.url));

if (!existsSync(src)) {
  console.warn(`[copy-samples] ${src} not found, skipping sample datasets.`);
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
const files = readdirSync(src).filter((f) => f.endsWith('.csv')).sort((a, b) => {
  const days = (f) => Number(/_(\d+)d_/.exec(f)?.[1] ?? 0);
  return days(a) - days(b);
});
const manifest = files.map((name) => {
  copyFileSync(join(src, name), join(dest, name));
  return { name, sizeBytes: statSync(join(src, name)).size, days: Number(/_(\d+)d_/.exec(name)?.[1] ?? 0) };
});
writeFileSync(join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`[copy-samples] copied ${files.length} sample datasets`);
