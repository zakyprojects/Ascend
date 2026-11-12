import { RECOVERY_MILESTONES } from '@/lib/points/recoveryAwards';
import { RECOVERY_POINTS } from '@/lib/points/pointsConfig';
import { CRISIS_ELSEWHERE, CRISIS_LINES } from '@/lib/content/crisisLines';
import { LINK_CLASS } from '../../components/MarketingLayout';
import { featurePath } from '../catalog';
import { Block, Cards, Note, Rules, Steps, type FeatureContent } from '../blocks';
import { pts } from '../format';

/* /features/recovery. Sources: lib/recoveryAwards.ts (check-in rules, RECOVERY_MILESTONES streak
   markers), lib/pointsConfig.ts RECOVERY_POINTS (perCheckin, seasonCap),
   components/views/AddictionRecovery.tsx (one tracker, clock starts when it is created, Clean today, craving
   form, emergency support with box breathing and distraction ideas, reset/delete wording, the
   medical disclaimer), lib/crisisLines.ts (the app's crisis numbers, listed here too), the Privacy
   Policy ("Only you: ... cravings and recovery tracker"; "Not medical advice") and the point_entries owner-only read policy.
   Helpline facts: https://www.samhsa.gov/find-help/helplines/national-helpline (opened 2026-10-21). */

const days = (hours: number) => hours / 24;
const [week, month, ninety] = RECOVERY_MILESTONES;
const perDay = RECOVERY_POINTS.perCheckin;
const cap = RECOVERY_POINTS.seasonCap;
const SAMHSA_URL = 'https://www.samhsa.gov/find-help/helplines/national-helpline';
const crisisNumber = (name: string) => CRISIS_LINES.find((line) => line.name === name)?.number ?? '';
const RESCUE_PHONE = crisisNumber('Rescue');
const UMANG_PHONE = crisisNumber('Umang');
const SAMHSA_PHONE = crisisNumber('SAMHSA Helpline');

export const recovery: FeatureContent = {
  intro: (
    <>
      <p>
        AscendDay’s recovery tracker is a free sobriety tracker on the web. Name the one thing you are stepping away from,
        like smoking, alcohol, sugar or social media, and a clean streak counter starts counting your days, hours and
        minutes. Tap Clean today once a day to earn a point, log a craving when it hits, and open emergency support
        for a breathing exercise.
      </p>
      <p>
        It is a private self-help tool: nobody else sees your tracker or your cravings. It is not treatment, and both this page
        and the app say so plainly.
      </p>
    </>
  ),
  heroShot: {
    name: 'recovery-phone',
    width: 540,
    height: 1246,
    alt: `The Recovery page on a phone: 46 days smoking free, 43 days 11 hours left to the ${days(ninety.hours)}-day milestone and 2 cravings this week`,
  },
  body: (
    <>
      <Block id="how-title" title="How the recovery tracker works">
        <Steps
          items={[
            {
              title: 'Start your tracker',
              text: 'Type what you are stepping away from and press Start clock now. The clock starts at that moment; it does not take a past quit date.',
            },
            {
              title: 'Watch the clock',
              text: `The page shows your clean time in days, hours and minutes, and a ring counting down to the next milestone: ${week.label}, ${month.label} and ${ninety.label}.`,
            },
            {
              title: 'Check in each day',
              text: 'Tap Clean today once a day. If you forgot yesterday, you can still check in for yesterday today. A missed day never breaks your streak; it only earns no point.',
            },
            {
              title: 'Log cravings as they come',
              text: 'Rate how strong it is from 1 to 10, write what triggered it and what helped or what you will try. A craving is information, not a failure, and it changes nothing about your streak.',
            },
            {
              title: 'Open emergency support',
              text: 'The red Emergency support button opens a guided 4-4-4-4 box-breathing circle and a rotating list of quick distractions, such as cold water, a short walk or messaging someone you trust.',
            },
          ]}
        />
        <Note title="One tracker, one focus.">
          AscendDay keeps one recovery tracker at a time. For a habit you only want to cut down on, such as late-night
          scrolling, the{' '}
          <a href={featurePath('bad-habits')} className={LINK_CLASS}>
            bad habit tracker
          </a>{' '}
          lets you log each day you resisted or slipped instead.
        </Note>
      </Block>

      <Block
        id="how-points-work"
        title="How recovery points work"
        lead={
          <>
            <p>
              Each day you tap Clean today earns {pts(perDay)}. AscendDay’s server writes it the moment your check-in
              arrives. One check-in counts per day, and the day you start a tracker or reset your streak earns nothing,
              so points start the next day.
            </p>
            <p>
              Recovery can earn at most {pts(cap)} in a season. Your streak keeps counting into the next season, and each
              new season can earn {pts(cap)} again. There are no bonuses, and points you earned are never taken back. Tapped by mistake? You can undo today’s check-in the same day, and its point goes with it.
            </p>
          </>
        }
      >
        <Rules
          caption="What earns recovery points"
          rows={[
            { what: 'Clean today, once a day', amount: `+${pts(perDay)}`, note: 'Yesterday can still be checked in today.' },
            { what: 'A day without a check-in', amount: 'no points', tone: 'none', note: 'Your streak keeps going.' },
            { what: 'The day you start the tracker or reset the streak', amount: 'no points', tone: 'none' },
            { what: 'Logging or deleting a craving', amount: 'no points', tone: 'none' },
            { what: 'Resetting the streak or deleting the tracker', amount: 'points stay', tone: 'none', note: 'Only the streak starts again.' },
          ]}
        />
        <Note title="A reset is not the end.">
          If you slip, Reset streak starts the clock again from now. The points you earned stay, and your next check-in
          counts from tomorrow. As the reset screen puts it, a slip is a setback, not the end.
        </Note>
      </Block>

      <Block
        id="cravings-title"
        title="A craving log: see what sets them off"
        lead={
          <p>
            Every craving you log keeps three things: how strong it was, what triggered it and what helped. After a few
            weeks the list shows patterns that are hard to see in the moment, like the same time of day, the same place or
            the same feeling coming back.
          </p>
        }
      >
        <Cards
          items={[
            {
              title: 'Triggers in your own words',
              text: 'Stress after work, a break between classes, seeing an ad, feeling lonely. You write it as it happened, with no category list to fit into.',
            },
            {
              title: 'What actually helped',
              text: 'Each entry pairs the trigger with what you did about it, so your next hard moment starts from something that has worked for you before.',
            },
            {
              title: 'A weekly count, then a clean slate',
              text: 'The top of the page shows how many cravings you logged this week. Clear older cravings deletes the ones from before this Monday for good and leaves your streak and points as they are.',
            },
          ]}
        />
      </Block>

      <Block
        id="privacy-title"
        title="Only you can see it"
        lead={
          <>
            <p>
              Your recovery tracker and your cravings are visible to you alone. Accountability partners never see them, and
              they are not part of the profile stats other members can see. The{' '}
              <a href="/privacy" className={LINK_CLASS}>
                Privacy Policy
              </a>{' '}
              lists them under what only you can see.
            </p>
            <p>
              Check-in points join your season total like any other points. Others see that total in league tables, never
              the entries behind it: your point history can only be read by you.
            </p>
          </>
        }
      />

      <Block
        id="help-title"
        title="When you need more than an app"
        lead={
          <p>
            A streak counter can help you notice progress and get through an urge. It cannot replace people who are trained
            to help, and you never have to wait until things get worse to reach out to them.
          </p>
        }
      >
        <Note title="AscendDay is not treatment, therapy or medical advice.">
          If you are in crisis, have severe withdrawal or a serious addiction, contact a doctor, a licensed professional or
          a helpline:
          <ul className="mt-2 space-y-1">
            {CRISIS_LINES.map((line) => (
              <li key={line.tel}>
                {line.place}: {line.name}{' '}
                <a href={`tel:${line.tel}`} className={LINK_CLASS}>
                  {line.number}
                </a>
                {line.note && ` (${line.note})`}
              </li>
            ))}
            <li>{CRISIS_ELSEWHERE}</li>
          </ul>
          <p className="mt-2">
            In the United States, the{' '}
            <a href={SAMHSA_URL} className={LINK_CLASS}>
              SAMHSA National Helpline
            </a>{' '}
            is free, confidential and open 24 hours a day for treatment referral and information.
          </p>
        </Note>
      </Block>
    </>
  ),
  wideShot: {
    name: 'recovery-desktop',
    width: 1400,
    height: 924,
    alt: `The Recovery page on a computer: the ${week.label}, ${month.label} and ${ninety.label} milestones, the medical disclaimer with the SAMHSA helpline, and the latest cravings with their triggers and what helped`,
    caption: 'The Recovery page on a computer, with the demo user Ali’s tracker.',
  },
  facts: [
    ['Milestones', `${days(week.hours)}, ${days(month.hours)} and ${days(ninety.hours)} days clean`],
    ['Points', `${pts(perDay)} per daily check-in`],
    ['Season limit', pts(cap)],
    ['Trackers', 'One at a time'],
    ['Cravings', 'Logged privately, no points'],
    ['Who sees it', 'Only you'],
    ['Price', 'Free while in beta'],
    ['Works on', 'Any browser, phone or computer'],
  ],
  fitsIf: [
    'You are quitting one thing and want a days clean counter that shows every clean day add up.',
    'You want a private place to note cravings, their triggers and what helped.',
    'A daily check-in and a point for each clean day help you keep going on the hard days.',
  ],
  notFor: [
    'You need treatment, detox or medical supervision; AscendDay can sit next to that care, never replace it.',
    'You want to enter a past quit date or track several things at once.',
  ],
  faq: [
    {
      q: 'Why use AscendDay for a sobriety streak instead of a separate sobriety app?',
      a: `Because the clean streak sits next to what you are building in its place: habits, workouts, reading and a journal, in one app. Each daily check-in earns ${pts(perDay)} toward your rank and the leagues, while the tracker and your cravings stay private and others only ever see a points total. It is a self-help tool; if you need treatment or a recovery programme, that comes first.`,
    },
    {
      q: 'Why does recovery need a daily check-in?',
      a: `Because a tap each day keeps you looking at the streak on purpose, not just letting a clock run. Each check-in earns ${pts(perDay)}, at most ${pts(cap)} from recovery in a season. Forgetting a day costs only that day’s point, never the streak, and yesterday can still be checked in today. Cravings never cost anything, so logging one honestly is always safe.`,
    },
    {
      q: 'Is the recovery tracker private?',
      a: 'Yes. Only you can see your tracker and your cravings. Partners and other members never see them; league tables show only your total points.',
    },
    {
      q: 'Can I start from an earlier quit date?',
      a: 'No. The clock starts when you create the tracker, so every day it shows is one AscendDay has counted with you.',
    },
    {
      q: 'What happens to my points if I relapse?',
      a: 'Reset streak starts the clock again. Every point you already earned stays. The reset day earns nothing, and your check-ins earn again from the next day.',
    },
    {
      q: 'Do cravings cost points?',
      a: 'No. Logging, deleting or clearing cravings never changes your points or your streak.',
    },
    {
      q: 'Is AscendDay an addiction treatment?',
      a: `No. It is a self-help tool, not treatment, therapy or medical advice. In Pakistan, call Rescue ${RESCUE_PHONE} in an emergency, or Umang (${UMANG_PHONE}), a mental health helpline. In the United States the SAMHSA National Helpline (${SAMHSA_PHONE}) is free and open 24/7. Anywhere else, contact a qualified professional or your local emergency number.`,
    },
  ],
  related: ['bad-habits', 'journal', 'brain-lessons', 'habits'],
  cta: { title: 'Start your clean-streak clock today', text: 'Free, private, and there when an urge hits.' },
};
