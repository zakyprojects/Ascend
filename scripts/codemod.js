import fs from 'node:fs';
import path from 'node:path';

export const exactClassMap = [
  // 1. Prefixed / Variant Text Tokens (run first to avoid partial collision)
  ['disabled:hover:text-slate-400', 'disabled:hover:text-content-muted'],
  ['disabled:hover:bg-white/5', 'disabled:hover:bg-overlay-subtle'],
  ['group-hover:text-slate-200', 'group-hover:text-content-secondary'],
  ['group-hover:text-slate-300', 'group-hover:text-content-tertiary'],
  ['hover:text-slate-100', 'hover:text-content-primary'],
  ['hover:text-slate-200', 'hover:text-content-secondary'],
  ['hover:text-slate-300', 'hover:text-content-tertiary'],
  ['hover:text-slate-400', 'hover:text-content-muted'],
  ['hover:text-white', 'hover:text-content-primary'],
  
  // 2. Placeholder text tokens
  ['placeholder:text-slate-600', 'placeholder:text-content-subtle'],
  ['placeholder:text-slate-500', 'placeholder:text-content-disabled'],
  ['placeholder:text-slate-400', 'placeholder:text-content-muted'],

  // 3. Base Text Tokens
  ['text-slate-100', 'text-content-primary'],
  ['text-slate-200', 'text-content-secondary'],
  ['text-slate-300', 'text-content-tertiary'],
  ['text-slate-400', 'text-content-muted'],
  ['text-slate-500', 'text-content-disabled'],
  ['text-slate-600', 'text-content-subtle'],

  // 4. Hover & Focus Border Tokens
  ['hover:border-white/10', 'hover:border-overlay-default'],
  ['hover:border-white/20', 'hover:border-overlay-strong'],
  ['hover:border-white/40', 'hover:border-overlay-heavy'],
  ['focus:border-white/20', 'focus:border-overlay-strong'],

  // 5. Base Border Tokens
  ['border-white/5', 'border-overlay-subtle'],
  ['border-white/10', 'border-overlay-default'],
  ['border-white/15', 'border-overlay-medium'],
  ['border-white/20', 'border-overlay-strong'],
  ['border-white/40', 'border-overlay-heavy'],

  // 6. Hover Background Tokens
  ['hover:bg-white/5', 'hover:bg-overlay-subtle'],
  ['hover:bg-white/10', 'hover:bg-overlay-default'],
  ['hover:bg-white/20', 'hover:bg-overlay-strong'],

  // 7. Base Background Tokens
  ['bg-white/5', 'bg-overlay-subtle'],
  ['bg-white/10', 'bg-overlay-default'],
  ['bg-white/20', 'bg-overlay-strong']
];

export function transformContent(content) {
  let updated = content;
  for (const [from, to] of exactClassMap) {
    const escapedFrom = from.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    // Class boundary matches spaces, single/double quotes, backticks, escaped quotes, or string start/end
    const regex = new RegExp(`(?<=([\\s"'\`]))${escapedFrom}(?=([\\s"'\`]))`, 'g');
    updated = updated.replace(regex, to);
  }
  return updated;
}

export function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.html') || file.endsWith('.css')) {
      results.push(filePath);
    }
  });
  return results;
}

if (process.argv[1] && process.argv[1].endsWith('codemod.js')) {
  const isExecute = process.argv.includes('--execute');
  const files = walk('./src').concat(['./index.html']);
  let modifiedCount = 0;

  files.forEach(file => {
    const original = fs.readFileSync(file, 'utf8');
    const transformed = transformContent(original);
    if (original !== transformed) {
      modifiedCount++;
      if (isExecute) {
        fs.writeFileSync(file, transformed, 'utf8');
      }
    }
  });

  console.log(`[Codemod] Scanned ${files.length} files. ${modifiedCount} files ${isExecute ? 'modified' : 'would be modified'}.`);
}
