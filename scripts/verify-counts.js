import fs from 'node:fs';
import path from 'node:path';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory() && file !== 'node_modules' && file !== 'dist' && file !== '.git' && file !== 'scripts') {
      results = results.concat(walk(filePath));
    } else if ((file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.html') || file.endsWith('.css')) && !filePath.includes('scripts/')) {
      results.push(filePath);
    }
  });
  return results;
}

const files = walk('./src').concat(['./index.html']);

function countMatch(regex) {
  let total = 0;
  const fileMatches = {};
  files.forEach(f => {
    const content = fs.readFileSync(f, 'utf8');
    const matches = content.match(regex);
    if (matches) {
      total += matches.length;
      fileMatches[f] = matches.length;
    }
  });
  return { total, fileMatches };
}

const textTokens = [
  'text-slate-100', 'text-slate-200', 'text-slate-300', 'text-slate-400', 'text-slate-500', 'text-slate-600',
  'hover:text-slate-100', 'hover:text-slate-200', 'hover:text-slate-300', 'hover:text-slate-400', 'hover:text-white',
  'group-hover:text-slate-200', 'group-hover:text-slate-300'
];

const borderTokens = [
  'border-white/5', 'border-white/10', 'border-white/15', 'border-white/20', 'border-white/40',
  'hover:border-white/10', 'hover:border-white/20', 'hover:border-white/40', 'focus:border-white/20'
];

const bgTokens = [
  'bg-white/5', 'bg-white/10', 'bg-white/20',
  'hover:bg-white/5', 'hover:bg-white/10', 'hover:bg-white/20'
];

console.log('=== AFTER COUNTS AUDIT ===\n');

console.log('--- TEXT CLASSES ---');
textTokens.forEach(t => {
  const reg = new RegExp('(?<=[\\s\"`\':])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[\\s\"`\':])', 'g');
  const res = countMatch(reg);
  console.log(`${t}: ${res.total}`);
  if (res.total > 0) console.log(res.fileMatches);
});

console.log('\n--- BORDER OVERLAY CLASSES ---');
borderTokens.forEach(t => {
  const reg = new RegExp('(?<=[\\s\"`\':])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[\\s\"`\':])', 'g');
  const res = countMatch(reg);
  console.log(`${t}: ${res.total}`);
  if (res.total > 0) console.log(res.fileMatches);
});

console.log('\n--- BG OVERLAY CLASSES ---');
bgTokens.forEach(t => {
  const reg = new RegExp('(?<=[\\s\"`\':])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[\\s\"`\':])', 'g');
  const res = countMatch(reg);
  console.log(`${t}: ${res.total}`);
  if (res.total > 0) console.log(res.fileMatches);
});
