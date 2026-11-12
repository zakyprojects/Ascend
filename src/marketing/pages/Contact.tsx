import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { cx, FOCUS_RING } from '@/components/ui/primitives/shared';
import { FieldErrorBubble, Input, Textarea } from '@/components/ui/primitives/Field';
import { FEEDBACK_KINDS } from '@/lib/app/feedbackPayload';
import { LEGAL_CONTACT_EMAIL } from '@/lib/content/legal';
import { Breadcrumb } from '../components/Breadcrumb';
import { LINK_CLASS, MarketingLayout } from '../components/MarketingLayout';
import { Section } from '../components/Sections';

/** Hero entrance order (marketing.css .m-enter staggers by --i). */
const enter = (i: number) => ({ '--i': i }) as CSSProperties;

/** Shown above the button while the page's script is missing (the form needs it to send). */
export const CONTACT_NO_SCRIPT = `This form needs JavaScript. You can email ${LEGAL_CONTACT_EMAIL} instead.`;

/**
 * /contact: a message to the maker from anyone, signed in or not (the app's Send feedback is the
 * same inbox). Static markup; contactForm.ts (loaded by client.ts only on this page) checks the
 * fields, runs the Turnstile check and sends it to /api/feedback.
 */
export function Contact() {
  return (
    <MarketingLayout>
      <section aria-labelledby="contact-title" className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 sm:pt-8">
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'Contact' }]} />
        <div className="mt-8 max-w-3xl lg:mt-12">
          <p className="m-enter text-sm font-medium text-brand-text" style={enter(0)}>
            Contact
          </p>
          <h1 id="contact-title" className="m-enter mt-3 font-serif text-4xl leading-[1.08] tracking-tight text-content-primary sm:text-6xl" style={enter(1)}>
            Write to the maker of AscendDay
          </h1>
          <p className="m-enter mt-6 text-base leading-relaxed text-content-tertiary sm:text-lg" style={enter(2)}>
            Found a bug, have an idea, or just want to say how it’s going? Every message is read by Zakria, who makes
            AscendDay, and a reply goes to the email you give.
          </p>
        </div>
      </section>

      <Section labelledBy="contact-form-title" className="sm:pt-16">
        <div className="grid gap-6 lg:grid-cols-5">
          <form
            data-contact-form=""
            noValidate
            aria-labelledby="contact-form-title"
            className="card relative space-y-5 p-6 sm:p-8 lg:col-span-3"
          >
            <h2 id="contact-form-title" className="section-title">
              Send a message
            </h2>

            <fieldset>
              <legend className="label block mb-1.5">What’s it about?</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {FEEDBACK_KINDS.map((option) => (
                  <label key={option.value} className="relative cursor-pointer">
                    <input
                      type="radio"
                      name="kind"
                      value={option.value}
                      defaultChecked={option.value === 'other'}
                      className="peer sr-only"
                    />
                    <span
                      className={cx(
                        'flex h-full flex-col rounded-xl border px-3.5 py-2.5 transition-colors',
                        'border-overlay-default bg-bg-700 hover:border-overlay-strong',
                        'peer-checked:border-primary-500 peer-checked:bg-primary-500/10',
                        'peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/60'
                      )}
                    >
                      <span className="text-sm font-medium text-content-primary">{option.label}</span>
                      <span className="text-xs text-content-muted">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Textarea
              id="contact-message"
              name="message"
              label="Your message"
              placeholder="What happened, what you’d like, or anything else."
              rows={6}
              maxLength={4000}
              required
            />
            <Input
              id="contact-email"
              name="email"
              type="email"
              label="Your email"
              hint="Only used to reply to you."
              autoComplete="email"
              maxLength={254}
              required
            />
            <Input id="contact-name" name="name" label="Your name" optional autoComplete="name" maxLength={80} />

            {/* Honeypot: off-screen and skipped by keyboard and screen readers; bots fill it. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <p className="text-xs text-content-muted">
              Sent with it: your browser, device type and screen size. See the{' '}
              <a href="/privacy" className={LINK_CLASS}>
                Privacy Policy
              </a>
              .
            </p>

            {/* Form-wide problems (contactForm.ts), then the place a Turnstile click challenge may show. */}
            <div data-contact-alert="" />
            <div data-captcha-slot="" className="contents" />
            <p data-contact-noscript="" className="text-xs text-content-muted">
              {CONTACT_NO_SCRIPT}
            </p>

            <div className="flex justify-end">
              <button type="submit" disabled data-contact-submit="" className="btn-primary min-h-11">
                Send message
              </button>
            </div>

            {/* The error bubble the script copies under a field (the app's FieldErrorBubble). */}
            <template data-contact-error-template="">
              <FieldErrorBubble message="" />
            </template>
          </form>

          <div className="space-y-6 lg:col-span-2">
            <div data-contact-sent="" hidden className="card p-6 sm:p-8" tabIndex={-1}>
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-500/15 text-brand-text">
                <Check size={24} aria-hidden="true" />
              </span>
              <h2 className="section-title mt-4">Thanks, it’s sent</h2>
              <p className="mt-2 text-sm text-content-secondary">
                Your reference is <span data-contact-ref="" className="figure font-semibold text-content-primary" />. Mention
                it if you write again about this.
              </p>
            </div>
            <div className="card p-6 sm:p-8 text-sm leading-relaxed text-content-secondary">
              <h2 className="text-lg font-semibold text-content-primary">Other ways</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-content-muted">
                <li>
                  Using the app? Open{' '}
                  <a href="/feedback" className={LINK_CLASS}>
                    Send feedback
                  </a>{' '}
                  there to add screenshots and the page you were on.
                </li>
                <li>
                  Email{' '}
                  <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={cx(LINK_CLASS, 'break-words')}>
                    {LEGAL_CONTACT_EMAIL}
                  </a>
                  .
                </li>
                <li>
                  Questions about your data: see the{' '}
                  <a href="/privacy" className={cx(LINK_CLASS, FOCUS_RING)}>
                    Privacy Policy
                  </a>
                  .
                </li>
              </ul>
            </div>
          </div>
        </div>
      </Section>
    </MarketingLayout>
  );
}
