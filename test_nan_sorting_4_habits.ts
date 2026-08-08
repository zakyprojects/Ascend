import { processBadHabitNoReports } from './src/lib/habitPenalties';

function testNaNSortingWithFourHabits() {
  console.log('======================================================================');
  console.log('   TESTING 4-HABIT UNDEFINED/INVALID createdAt STABILITY IN V8 SORT   ');
  console.log('======================================================================\n');

  // Scenario: 4 habits, some created early before schema migration (missing createdAt or invalid dates)
  const h1 = { id: 'bh-1', name: 'Bad Habit 1', commitmentDays: 30, createdAt: '2026-08-01T10:00:00.000Z', isCompleted: false };
  const h2 = { id: 'bh-2', name: 'Bad Habit 2', commitmentDays: 30, createdAt: undefined as any, isCompleted: false };
  const h3 = { id: 'bh-3', name: 'Bad Habit 3', commitmentDays: 30, createdAt: '2026-08-03T10:00:00.000Z', isCompleted: false };
  const h4 = { id: 'bh-4', name: 'Bad Habit 4', commitmentDays: 30, createdAt: undefined as any, isCompleted: false };

  const habits = [h1, h2, h3, h4];

  console.log('Original Habits Array order:', habits.map(h => h.id));

  // Sort multiple times with current sort function
  for (let run = 1; run <= 5; run++) {
    const sorted = [...habits].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    console.log(`Run ${run} current sort order:`, sorted.map(h => h.id));
    console.log(`  Habit 4 index: ${sorted.findIndex(h => h.id === 'bh-4')}, isPointEligible: ${sorted.findIndex(h => h.id === 'bh-4') < 2}`);
  }

  // Safe fallback sort comparator
  const safeSort = (habitsList: any[]) => {
    return [...habitsList].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      const validA = isNaN(timeA) ? 0 : timeA;
      const validB = isNaN(timeB) ? 0 : timeB;
      if (validA !== validB) return validA - validB;
      return (a.id || '').localeCompare(b.id || '');
    });
  };

  console.log('\nTesting SAFE deterministic sort function:');
  for (let run = 1; run <= 5; run++) {
    const sorted = safeSort(habits);
    console.log(`Run ${run} SAFE sort order:`, sorted.map(h => h.id));
    console.log(`  Habit 4 index: ${sorted.findIndex(h => h.id === 'bh-4')}, isPointEligible: ${sorted.findIndex(h => h.id === 'bh-4') < 2}`);
  }
}

testNaNSortingWithFourHabits();
