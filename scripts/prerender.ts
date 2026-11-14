// After `vite build` (npm run build): writes the public pages into dist/ and checks the result.
// The logic lives in src/marketing (typed, linted, tested); this file only reads and writes.
// Run with vite-node so the @/ alias and TSX work as in the app.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite, type ViteManifestChunk } from '../src/marketing/prerender';
import { checkSite } from '../src/marketing/seoChecks';
import type { VercelConfig } from '../src/marketing/vercelRules';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [relative(dist, path).split('\\').join('/')];
  });
}

const manifestPath = join(dist, '.vite', 'manifest.json');
if (!existsSync(manifestPath)) throw new Error('dist/.vite/manifest.json missing: run vite build first');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, ViteManifestChunk>;

// The app shell: vite build's index.html (or app-shell.html when this runs twice on one build).
const shellFile = existsSync(join(dist, 'app-shell.html')) ? 'app-shell.html' : 'index.html';
const shellHtml = readFileSync(join(dist, shellFile), 'utf-8');
if (!shellHtml.includes('id="root"')) throw new Error(`dist/${shellFile} is not the app shell`);
if (shellFile === 'index.html') renameSync(join(dist, 'index.html'), join(dist, 'app-shell.html'));

const assetFiles = listFiles(dist).filter((file) => file.startsWith('assets/'));
const written = buildSite({ shellHtml, manifest, assetFiles });
for (const [file, text] of Object.entries(written)) {
  mkdirSync(dirname(join(dist, file)), { recursive: true });
  writeFileSync(join(dist, file), text);
}

const files = new Map<string, string>();
for (const file of listFiles(dist)) {
  files.set(file, /\.(html|xml|txt)$/.test(file) ? readFileSync(join(dist, file), 'utf-8') : '');
}
const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf-8')) as VercelConfig;
const errors = await checkSite(files, config);
if (errors.length > 0) {
  console.error(`\nSite checks failed:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`Prerendered ${Object.keys(written).length} files into dist/; site checks passed.`);
