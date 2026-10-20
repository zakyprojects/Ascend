// Runs every fixture file in src/**/__tests__ through vite-node (so import.meta.env,
// the @/ alias and module order behave as in the app), one process per file.
// Exits non-zero if any file fails, so CI turns red.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const viteNode = join(root, 'node_modules', 'vite-node', 'vite-node.mjs');

function findTests(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : findTests(path);
    return path.includes('__tests__') && entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

const files = findTests(join(root, 'src')).sort();
if (files.length === 0) {
  console.error('No test files found.');
  process.exit(1);
}

const failed = [];
for (const file of files) {
  const name = relative(root, file);
  console.log(`\n▶ ${name}`);
  const result = spawnSync(process.execPath, [viteNode, file], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) failed.push(name);
}

console.log(`\n${files.length - failed.length}/${files.length} test files passed.`);
if (failed.length > 0) {
  console.error(`Failed:\n  ${failed.join('\n  ')}`);
  process.exit(1);
}
