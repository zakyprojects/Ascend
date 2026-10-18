import type { AppNotification } from '@/types';
import { describeGroup, describeNotification, groupNotifications, notificationPenalty } from '../notificationMeta';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

let seq = 0;
function n(partial: Partial<AppNotification> & { type: string }): AppNotification {
  seq += 1;
  return {
    id: `n${seq}`,
    recipientId: 'me',
    message: '',
    read: false,
    createdAt: `2026-10-17T19:${String(60 - seq).padStart(2, '0')}:00.000Z`,
    payload: {},
    ...partial,
  };
}

// Sample rows shaped like the server's (title/message/payload as written in SQL).
const SAMPLES: AppNotification[] = [
  n({ type: 'partner_invite', actorUsername: 'ali', actorAvatar: '🦊', title: 'New Partner Invite', message: 'ali sent you an accountability partner invite!', payload: { inviteId: 'i1' } }),
  n({ type: 'partner_invite_accepted', actorUsername: 'ali', title: 'Partner Invite Accepted 🎉', message: 'ali accepted your partner invite!' }),
  n({ type: 'partner_invite_declined', actorUsername: 'ali', title: 'Partner Invite Declined', message: 'ali declined your partner invite.' }),
  n({ type: 'partner_removed', actorUsername: 'ali', title: 'Partner removed', message: 'ali removed you as a partner.' }),
  n({ type: 'challenge_deleted', actorUsername: 'ali', title: 'Challenge deleted', message: 'ali deleted the challenge "Run 5k".' }),
  n({ type: 'partner_nudge', actorUsername: 'ali', title: 'Your partner nudged you', message: "ali is waiting for you to finish today's challenges." }),
  n({ type: 'partner_pledge_done', actorUsername: 'ali', title: 'Partner Completed Challenge Today', message: 'ali completed today\'s target for "Run 5k"! Don\'t break your joint streak!' }),
  n({ type: 'challenge_completed', actorUsername: 'ali', title: 'Shared Challenge Completed! 🎉', message: 'Congratulations! You and ali completed the "Run 5k" challenge!' }),
  n({ type: 'partner_missed_habit', actorId: 'a1', actorUsername: 'ali', title: 'Streak Risk Warning', message: 'Your partner ali missed their habit "Read". Reach out to encourage them!', payload: { habitName: 'Read', period: '2026-10-17' } }),
  n({ type: 'missed_habit', title: 'Habit Missed Penalty', message: 'You missed your habit "Read" for period 2026-10-17. 3 points deducted.', payload: { habitName: 'Read', period: '2026-10-17' } }),
  n({ type: 'missed_habit', title: 'Habit Missed Penalty', message: 'You missed your habit "Walk" for period 2026-10-17. 4 points deducted.', payload: { habitName: 'Walk', period: '2026-10-17' } }),
  n({ type: 'missed_habit', title: 'Habit Missed Penalty', message: 'You missed your habit "Gym" for period 2026-W42. ', payload: { habitName: 'Gym', period: '2026-W42' } }),
  n({ type: 'bad_habit_no_report', title: 'Bad Habit No-Report Penalty', message: 'No status reported for "Doomscrolling" on 2026-10-17. 3 points deducted.', payload: { badHabitName: 'Doomscrolling', date: '2026-10-17' } }),
  n({ type: 'missed_exercise_target', title: 'Exercise Goal Missed', message: 'You logged 1/3 workout sessions for week 2026-W41. 5 points deducted.', payload: { weekKey: '2026-W41', logged: 1, target: 3 } }),
  n({ type: 'addiction_milestone', title: 'Sobriety Milestone Reached! 🎉', message: 'Congratulations! You unlocked milestone(s): 1 Week Clean for Smoking.', payload: { substance: 'Smoking', milestones: ['1 Week Clean'] } }),
  n({ type: 'daily_reminder', actorUsername: 'Ascend System', actorAvatar: '⚡', title: 'Evening Tracker Check-in 🌙', message: "Don't break your momentum!", payload: { date: '2026-10-17', missing: ['Journal', 'Read'] } }),
  n({ type: 'sunday_planning', actorUsername: 'Ascend Executive System', actorAvatar: '🎯', title: 'Sunday Evening Goal Planning', message: "Take 5 minutes to set your top 3 measurable goals and review last week's velocity.", payload: { weekKey: '2026-W42' } }),
];

function runFixtures() {
  for (const row of SAMPLES) {
    const view = describeNotification(row);
    const text = `${view.title} ${view.message}`;
    assert(Boolean(view.title) && Boolean(view.message), `${row.type}: has title and message`);
    assert(!/[🎉🌙🏅🏆👑]/u.test(text), `${row.type}: no emoji (${text})`);
    assert(!text.includes('!'), `${row.type}: no exclamation (${text})`);
    assert(!/points deducted|velocity|for period|\d{4}-\d{2}-\d{2}|\d{4}-W\d{2}/.test(text), `${row.type}: no raw server text (${text})`);
    assert(view.link !== null, `${row.type}: opens a page`);
  }

  const byType = (type: string) => describeNotification(SAMPLES.find((s) => s.type === type)!);
  assert(byType('missed_habit').link === 'habits', 'missed habit opens Habits');
  assert(byType('bad_habit_no_report').link === 'bad-habits', 'bad habit opens Bad habits');
  assert(byType('partner_invite').link === 'partner', 'invite opens Partners');
  assert(byType('sunday_planning').link === 'weekly-goals', 'Sunday planning opens Weekly goals');
  assert(byType('addiction_milestone').link === 'recovery', 'milestone opens Recovery');
  assert(byType('daily_reminder').link === 'dashboard', 'daily reminder opens Dashboard');
  assert(byType('missed_exercise_target').link === 'exercise', 'exercise target opens Exercise');
  assert(byType('bad_habit_no_report').message.endsWith('−3 pts'), 'penalty shown in points');
  assert(byType('addiction_milestone').message === '1 week clean from Smoking.', 'milestone copy');
  assert(byType('daily_reminder').showActor === false, 'system notices hide their emoji avatar');
  assert(byType('partner_invite').showActor === true, 'partner notices show the avatar');

  assert(notificationPenalty(SAMPLES[9]) === 3, 'penalty parsed');
  assert(notificationPenalty(SAMPLES[11]) === null, 'no penalty when none deducted');

  const unknown = describeNotification(n({ type: 'something_new', title: 'Hello', message: 'World' }));
  assert(unknown.title === 'Hello' && unknown.message === 'World' && unknown.link === null, 'unknown type falls back to stored text');

  const entries = groupNotifications(SAMPLES);
  const groups = entries.filter((e) => e.kind === 'group');
  assert(groups.length === 1, 'one group: two missed habits on the same day');
  const group = groups[0];
  assert(group.kind === 'group' && group.items.length === 2, 'the group holds both rows');
  if (group.kind === 'group') {
    const view = describeGroup(group.items);
    assert(view.title === 'Missed 2 habits', `group title (${view.title})`);
    assert(view.message.endsWith('−7 pts'), `group total (${view.message})`);
  }
  assert(entries.length === SAMPLES.length - 1, 'every other row stays single');
  const groupIndex = entries.findIndex((e) => e.kind === 'group');
  assert(groupIndex === 9, 'group sits where its newest row was');

  console.log('\nAll notificationMeta fixture assertions PASSED successfully!');
}

runFixtures();
