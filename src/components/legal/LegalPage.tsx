import { useEffect, useRef, type ReactNode } from 'react';
import { AppLockup } from '@/components/ui/AppLogo';
import { cx, FOCUS_RING } from '@/components/ui/primitives/shared';
import { LEGAL_CONTACT_EMAIL, LEGAL_OPERATOR, LEGAL_UPDATED, MIN_AGE } from '@/lib/legal';
import { DASHBOARD_PATH, pathForLegalRoute, type LegalRoute } from '@/lib/routes';

export interface LegalPageProps {
  page: LegalRoute;
  /** Goes to an address on this site. */
  onNavigate: (path: string) => void;
  /** Where the logo and "Back to Ascend" go: the dashboard in the app, the landing page when prerendered. */
  homeHref?: string;
}

const TITLES: Record<LegalRoute, string> = { privacy: 'Privacy Policy', terms: 'Terms' };

const LINK_CLASS = cx('font-medium text-brand-text hover:underline underline-offset-2 rounded', FOCUS_RING);

/** A plain left click follows the link in-app; modified/middle clicks keep the browser's own behaviour. */
function inAppClick(href: string, navigate: (href: string) => void) {
  return (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-content-muted">{children}</ul>;
}

/** A term at the start of a list item or paragraph. */
function Term({ children }: { children: ReactNode }) {
  return <span className="font-medium text-content-primary">{children}</span>;
}

function ContactEmail() {
  return (
    <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={cx(LINK_CLASS, 'break-words')}>
      {LEGAL_CONTACT_EMAIL}
    </a>
  );
}

function PrivacyPolicy({ onNavigate }: { onNavigate: (path: string) => void }) {
  const termsPath = pathForLegalRoute('terms');
  return (
    <>
      <p>
        This policy explains what AscendDay collects, why, who can see it, and how to delete it. We don’t sell your data, track
        you across other sites, or record your screen. It goes with our{' '}
        <a href={termsPath} onClick={inAppClick(termsPath, onNavigate)} className={LINK_CLASS}>
          Terms
        </a>
        .
      </p>

      <Section title="Who we are">
        <p>
          {LEGAL_OPERATOR}. For anything about your data, email <ContactEmail />.
        </p>
      </Section>

      <Section title="What we collect">
        <List>
          <li>
            <Term>Your account.</Term> Your email address and password. The password is stored only in a protected
            (hashed) form by our sign-in provider. A guest account has no email or password.
          </li>
          <li>
            <Term>Your profile.</Term> Your username, avatar, a 6-digit user ID, the date you joined, your points, your
            timezone, and your settings, such as notifications and whether your profile is public.
          </li>
          <li>
            <Term>What you add.</Term> Habits, bad habits, workouts, books and reading, skills, journal entries and
            moods, emotion, craving and decision logs, focus sessions, goals, projects, tasks, weekly goals, time
            tracking, plans, partner challenges, lessons you’ve read, and your recovery tracker.
          </li>
          <li>
            <Term>Sensitive data.</Term> Some of what you add is personal, like your journal, moods, cravings and what
            you track in recovery. Only you can see it, and we never share or sell it.
          </li>
          <li>
            <Term>Sign-in and security.</Term> While you’re signed in, our sign-in provider stores your IP address and
            browser type with your session. A failed sign-in with a username is logged with that username and your IP
            address for 1 hour, to stop password guessing. A bot check (Cloudflare Turnstile) runs when you sign in,
            sign up, start as a guest, reset or change your password, or delete your account. Cloudflare sees your IP
            address and browser details for this.
          </li>
          <li>
            <Term>Crash reports.</Term> When something breaks, the app sends an error report to Sentry: what went
            wrong, the page, your browser and device type, the app version, and your account ID. Sentry works out a
            rough city and country from your IP address but doesn’t keep the address itself. Nothing on your screen
            is recorded.
          </li>
          <li>
            <Term>Page visits.</Term> We count visits to each page with Vercel Web Analytics: the page address
            (without anything after it), the referring site, your country, and your browser, system and device type.
            It uses no cookies and isn’t linked to your account. Your IP address is only used to tell visits apart
            within one day and isn’t stored.
          </li>
          <li>
            <Term>Notifications.</Term> In-app notices (from partners, leagues and reminders) are kept in your account.
            If you turn on push notifications, we store your browser’s push address for that device.
          </li>
          <li>
            <Term>Bug reports and ideas.</Term> When you send one, we keep your text, any screenshots you add, your
            browser, device, screen size, theme, the app version, and your user ID (or “guest”). They are stored as
            issues in a private GitHub repository.
          </li>
          <li>
            <Term>On your device.</Term> The app keeps your sign-in, a copy of your data for offline use, drafts and
            settings in your browser’s storage. AscendDay sets no cookies of its own; Cloudflare’s bot check may use its
            own.
          </li>
        </List>
      </Section>

      <Section title="Why we use it">
        <p>
          To run your account, save and sync your data across devices, award points, run leagues and partner
          features, send the reminders you turned on, keep AscendDay safe from abuse, and fix bugs. Nothing else.
        </p>
      </Section>

      <Section title="Who can see what">
        <List>
          <li>
            <Term>Anyone, even without signing in:</Term> your username, avatar, user ID, join date, points and season,
            whether your profile is public, and whether you accept partner invites.
          </li>
          <li>
            <Term>Other members:</Term> if your profile is public, a summary of your stats (such as streaks, the last day
            you were active, and how many habits, journal entries, books, exercise minutes and skills you have). League
            results show your username, avatar and points to the others in that league. Plans you make public show
            your username and avatar.
          </li>
          <li>
            <Term>Your partners:</Term> your stats, your timezone, and what you share in your partnership and
            challenges.
          </li>
          <li>
            <Term>Only you:</Term> everything else, including your email, journal, moods, cravings and recovery
            tracker.
          </li>
        </List>
      </Section>

      <Section title="Services we use">
        <p>These companies handle data for us, only to run AscendDay. They may process it outside your country.</p>
        <List>
          <li>
            <Term>Supabase:</Term> database, sign-in and server functions. Your data is stored in Sydney, Australia.
          </li>
          <li>
            <Term>Vercel:</Term> hosts the app and its small server functions, and counts page visits.
          </li>
          <li>
            <Term>Sentry:</Term> crash reports, stored in the EU (Germany).
          </li>
          <li>
            <Term>Cloudflare Turnstile:</Term> the bot check.
          </li>
          <li>
            <Term>GitHub:</Term> keeps the bug reports and ideas you send, in a private repository.
          </li>
          <li>
            <Term>UptimeRobot:</Term> checks every few minutes that the site is up. It doesn’t receive your data.
          </li>
          <li>
            <Term>Browser push services</Term> (Google, Mozilla, Apple): deliver push notifications, which are
            encrypted.
          </li>
        </List>
      </Section>

      <Section title="How long we keep it">
        <List>
          <li>Your data stays while your account exists.</li>
          <li>
            Things you delete are removed from our server after 30 days. Your points records and league results stay
            as history while your account exists.
          </li>
          <li>
            A guest account is deleted after 30 days without use (unless someone follows a public plan it made). A
            guest who logs out loses the account at once.
          </li>
          <li>Failed sign-in records: 1 hour.</li>
          <li>Notifications: 30 days, then deleted automatically.</li>
          <li>Crash reports: for a limited time, under Sentry’s retention rules.</li>
          <li>Page-visit counts: anonymous, under Vercel’s retention rules.</li>
          <li>Bug reports and ideas: until you ask us to remove them.</li>
        </List>
      </Section>

      <Section title="Deleting your account">
        <p>
          Go to Settings, then Account, then Delete account. This removes your account and your data from our
          database straight away: your profile, everything you added, your points, notifications, partnerships and
          invites, your plans (public ones too) and your push subscriptions. You are also removed from other members’
          league results.
        </p>
        <p>What stays:</p>
        <List>
          <li>Copies of your public plans that others already followed (without your name).</li>
          <li>Bug reports and ideas you sent, until you ask us to remove them.</li>
          <li>Copies in our providers’ logs and backups, for a short time until they expire.</li>
          <li>Data saved on your other devices, until you sign out there.</li>
        </List>
      </Section>

      <Section title="Your choices">
        <p>
          You can see and change most of your data in the app, make your profile private, turn notifications on or
          off, and delete your account in Settings. To ask for a copy of your data, a correction, or the removal of a
          bug report, email <ContactEmail />.
        </p>
      </Section>

      <Section title="Children">
        <p>
          AscendDay is not for children under {MIN_AGE}. If you are under {MIN_AGE}, please don’t use it. If we learn that
          an account belongs to a child under {MIN_AGE}, we will delete it. Parents can contact us at <ContactEmail />.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Connections to AscendDay are encrypted, passwords are stored hashed, and database rules let each account read
          only its own private data. No system is perfect. If a data breach affects you, we will tell you as soon as we
          can.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          When this policy changes, we update this page and the date at the top. If a change is important, we’ll also
          tell you in the app.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions or requests: <ContactEmail />.
        </p>
      </Section>
    </>
  );
}

function Terms({ onNavigate }: { onNavigate: (path: string) => void }) {
  const privacyPath = pathForLegalRoute('privacy');
  return (
    <>
      <p>
        These Terms are the rules for using AscendDay. By creating an account or continuing as a guest, you agree to them
        and to our{' '}
        <a href={privacyPath} onClick={inAppClick(privacyPath, onNavigate)} className={LINK_CLASS}>
          Privacy Policy
        </a>
        .
      </p>

      <Section title="Who we are">
        <p>{LEGAL_OPERATOR}. AscendDay is free and still in beta.</p>
      </Section>

      <Section title="Who can use AscendDay">
        <p>You must be {MIN_AGE} or older to use AscendDay.</p>
      </Section>

      <Section title="Your account">
        <List>
          <li>Keep your password safe. You are responsible for what happens in your account.</li>
          <li>One account is for one person.</li>
          <li>Pick a username that isn’t offensive and doesn’t pretend to be someone else.</li>
          <li>
            A guest account lives on one device. If you log out, clear your browser data, or don’t use it for 30 days,
            the guest account and its data are deleted. Create an account to keep your progress.
          </li>
        </List>
      </Section>

      <Section title="Fair play">
        <p>Points, ranks and leagues should show real effort. Don’t:</p>
        <List>
          <li>log things you didn’t do to get points,</li>
          <li>use more than one account to get ahead,</li>
          <li>use bots, scripts or bugs to change points or rankings,</li>
          <li>harass, threaten or spam others, through usernames, plans, partner invites or nudges,</li>
          <li>put illegal, hateful or sexual content in usernames or public plans,</li>
          <li>try to break, overload or get around AscendDay’s security, or reach other people’s data.</li>
        </List>
      </Section>

      <Section title="Suspension">
        <p>
          We may remove points, reset rankings, or suspend or delete accounts that cheat in leagues or abuse AscendDay or
          other people. Where we can, we’ll tell you why. If you think we got it wrong, email <ContactEmail />.
        </p>
      </Section>

      <Section title="Your content">
        <p>
          What you add stays yours. You let us store it, sync it, and show it where AscendDay is built to show it: your
          public profile, league tables, public plans, and what you share with partners. When you make a plan public,
          other members can follow it and keep their own copy.
        </p>
      </Section>

      <Section title="Points have no money value">
        <p>
          Points, ranks and badges are for motivation only. They can’t be exchanged for money or prizes. We may change
          how points, ranks, seasons and leagues work.
        </p>
      </Section>

      <Section title="Not medical advice">
        <p>
          The recovery tracker, craving and emotion logs, lessons, exercise tracking and other health-related features
          are for general self-improvement only. They are not medical, psychological or other professional advice,
          diagnosis or treatment. If you’re struggling with addiction or with your physical or mental health, talk to
          a doctor or another qualified professional. In an emergency, contact your local emergency services.
        </p>
      </Section>

      <Section title="The service">
        <p>
          AscendDay is provided “as is”. It may have bugs, change, or be unavailable at times, and features may be added
          or removed. We work to keep your data safe, but we can’t promise that AscendDay will always work or that data
          can never be lost.
        </p>
      </Section>

      <Section title="Limits on our responsibility">
        <p>
          As far as the law allows, we are not responsible for indirect losses or for problems outside our control.
          Nothing in these Terms takes away rights you have by law.
        </p>
      </Section>

      <Section title="Ending">
        <p>
          You can stop using AscendDay and delete your account at any time in Settings. If we ever shut AscendDay down, we’ll
          try to tell you in advance.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          When these Terms change, we update this page and the date at the top. If a change is important, we’ll also
          tell you in the app. Using AscendDay after a change means you accept the new Terms.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions: <ContactEmail />.
        </p>
      </Section>

      <section className="space-y-1.5 border-t border-overlay-subtle pt-6 text-xs text-content-muted">
        <h2 className="text-xs font-medium text-content-secondary">Open-source credits</h2>
        <p>
          The Geist, Geist Mono and Instrument Serif fonts are used under the SIL Open Font License 1.1. Icons are from
          Lucide (ISC License). AscendDay is built with open-source libraries, including React, Supabase and Sentry (MIT
          License).
        </p>
      </section>
    </>
  );
}

/**
 * `/privacy` and `/terms`: shown to anyone, signed in or not, outside the app shell. Plain text in
 * one readable column, with links to the other page and back to the app.
 */
export function LegalPage({ page, onNavigate, homeHref = DASHBOARD_PATH }: LegalPageProps) {
  const mainRef = useRef<HTMLElement>(null);
  const otherPage: LegalRoute = page === 'privacy' ? 'terms' : 'privacy';
  const otherPath = pathForLegalRoute(otherPage);

  useEffect(() => {
    const previous = document.title;
    document.title = `${TITLES[page]} · AscendDay`;
    // Switching between the two pages starts the new one at the top (phones scroll the window,
    // desktop scrolls this page).
    window.scrollTo(0, 0);
    if (mainRef.current) mainRef.current.scrollTop = 0;
    return () => {
      document.title = previous;
    };
  }, [page]);

  return (
    <main
      ref={mainRef}
      className="relative isolate flex-1 lg:min-h-0 lg:overflow-y-auto bg-bg-900 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))]"
    >
      <div aria-hidden="true" className="app-atmosphere" />
      <div className="mx-auto w-full max-w-2xl">
        <a href={homeHref} onClick={inAppClick(homeHref, onNavigate)} aria-label="AscendDay" className={cx('inline-flex rounded-lg', FOCUS_RING)}>
          <AppLockup className="h-6 w-auto shrink-0 text-content-primary" />
        </a>

        <header className="mt-8">
          <h1 className="page-title">{TITLES[page]}</h1>
          <p className="page-subtitle">Last updated {LEGAL_UPDATED}</p>
        </header>

        <article className="card mt-6 p-5 sm:p-8 space-y-8 text-sm leading-relaxed text-content-secondary">
          {page === 'privacy' ? <PrivacyPolicy onNavigate={onNavigate} /> : <Terms onNavigate={onNavigate} />}
        </article>

        <nav aria-label="Legal" className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm">
          <a href={otherPath} onClick={inAppClick(otherPath, onNavigate)} className={cx(LINK_CLASS, 'inline-flex min-h-11 items-center')}>
            {TITLES[otherPage]}
          </a>
          <a href={homeHref} onClick={inAppClick(homeHref, onNavigate)} className={cx(LINK_CLASS, 'inline-flex min-h-11 items-center')}>
            Back to AscendDay
          </a>
        </nav>
      </div>
    </main>
  );
}
