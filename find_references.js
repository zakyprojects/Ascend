import * as fs from 'fs';
import * as path from 'path';

function searchDirectory(dir: string, targets: string[]) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchDirectory(fullPath, targets);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        targets.forEach((target) => {
          if (line.includes(target)) {
            console.log(`Found "${target}" in ${fullPath}:${index + 1}`);
            console.log(`   ${line.trim()}`);
          }
        });
      });
    }
  }
}

console.log('--- SEARCHING CODEBASE FOR HABIT JOURNEY REFERENCES ---');
searchDirectory(path.join(process.cwd(), 'src'), [
  'undoHabitJourneyDone',
  'markFollowedHabitJourneyDone',
  'undoFollowedHabitJourneyDone',
]);
