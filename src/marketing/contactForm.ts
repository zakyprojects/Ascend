/**
 * The /contact form (pages/Contact.tsx): loaded by client.ts only on that page. Checks the fields
 * one at a time with the app's error bubble, solves a Cloudflare Turnstile token (lib/captcha.ts,
 * action "contact"; the server verifies it) and sends the message to /api/feedback as a
 * signed-out sender. No React, no Supabase.
 */
import { getCaptchaToken, registerCaptchaSlot } from '@/lib/captcha';
import {
  FEEDBACK_ERROR_MESSAGES,
  FEEDBACK_FALLBACK_ERROR,
  buildContactPayload,
  isFeedbackKind,
  looksLikeEmail,
  newFeedbackRefAt,
} from '@/lib/feedbackPayload';

const SEND_LABEL = 'Send message';
// The app's field border, normal and with a problem (components/ui/primitives/Field.tsx fieldBorder).
const BORDER_OK = ['border-overlay-default', 'hover:border-overlay-medium', 'focus:border-primary-500', 'focus:ring-primary-500/20'];
const BORDER_ERROR = ['border-error', 'focus:border-error', 'focus:ring-error/20'];
const SENDING_LABEL = 'Sending…';

function deviceContext(): Record<string, string> {
  return {
    Device: window.matchMedia('(pointer: coarse)').matches ? 'Touch' : 'Desktop',
    Screen: `${window.innerWidth}×${window.innerHeight}`,
    Theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'Light' : 'Dark',
    Browser: navigator.userAgent.slice(0, 120),
    Account: 'Signed out (contact page)',
  };
}

export function installContactForm(form: HTMLFormElement): void {
  const submit = form.querySelector<HTMLButtonElement>('[data-contact-submit]');
  const alertHost = form.querySelector<HTMLElement>('[data-contact-alert]');
  const template = form.querySelector<HTMLTemplateElement>('[data-contact-error-template]');
  const slot = form.querySelector<HTMLElement>('[data-captcha-slot]');
  const sent = document.querySelector<HTMLElement>('[data-contact-sent]');
  const message = form.querySelector<HTMLTextAreaElement>('#contact-message');
  const email = form.querySelector<HTMLInputElement>('#contact-email');
  const name = form.querySelector<HTMLInputElement>('#contact-name');
  const website = form.querySelector<HTMLInputElement>('input[name="website"]');
  if (!submit || !alertHost || !template || !message || !email || !name || !website) return;

  form.querySelector('[data-contact-noscript]')?.remove();
  submit.disabled = false;
  if (slot) registerCaptchaSlot(slot);

  const openedAt = performance.now();
  // One reference per message, kept across retries (the server answers a repeat with the first send).
  let ref = newFeedbackRefAt(Math.floor(performance.timeOrigin + performance.now()));
  let sending = false;

  /** The app's one-at-a-time error bubble: under a field (focused), or above the button. */
  const clearError = () => {
    form.querySelectorAll('[data-contact-error]').forEach((node) => node.remove());
    form.querySelectorAll<HTMLElement>('[aria-invalid="true"]').forEach((node) => {
      node.removeAttribute('aria-invalid');
      node.classList.remove(...BORDER_ERROR);
      node.classList.add(...BORDER_OK);
    });
    form.querySelectorAll<HTMLElement>('[data-hint-hidden]').forEach((hint) => {
      hint.hidden = false;
      hint.removeAttribute('data-hint-hidden');
    });
  };
  const showError = (text: string, field?: HTMLInputElement | HTMLTextAreaElement) => {
    clearError();
    const bubble = template.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
    if (!bubble) return;
    bubble.setAttribute('data-contact-error', '');
    const label = bubble.querySelector('span.leading-5');
    if (label) label.textContent = text;
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.classList.remove(...BORDER_OK);
      field.classList.add(...BORDER_ERROR);
      // The bubble takes the hint's place, as in the app.
      const hint = document.getElementById(`${field.id}-hint`);
      if (hint) {
        hint.hidden = true;
        hint.setAttribute('data-hint-hidden', '');
      }
      bubble.id = `${field.id}-error`;
      field.closest('[data-field]')?.appendChild(bubble);
      field.focus();
      field.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
      bubble.classList.remove('field-error-attached');
      alertHost.appendChild(bubble);
    }
  };
  // Typing in the field with the problem clears it.
  form.addEventListener('input', (event) => {
    if ((event.target as HTMLElement).getAttribute('aria-invalid') === 'true') clearError();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    if (!message.value.trim()) return showError('Fill in this field.', message);
    if (!email.value.trim()) return showError('Fill in this field.', email);
    if (!looksLikeEmail(email.value)) return showError('Enter a valid email address.', email);
    clearError();

    const checked = form.querySelector<HTMLInputElement>('input[name="kind"]:checked')?.value;
    const kind = isFeedbackKind(checked) ? checked : 'other';
    sending = true;
    submit.disabled = true;
    submit.textContent = SENDING_LABEL;
    try {
      const captchaToken = (await getCaptchaToken('contact')) ?? '';
      let res: Response;
      try {
        res = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            buildContactPayload({
              kind,
              ref,
              name: name.value,
              email: email.value,
              message: message.value,
              captchaToken,
              context: deviceContext(),
              fillMs: performance.now() - openedAt,
              website: website.value,
            })
          ),
        });
      } catch {
        throw new Error('Couldn’t reach AscendDay. Check your connection and try again.');
      }
      const body = (await res.json().catch(() => null)) as { ok?: boolean; ref?: string; error?: string } | null;
      if (!res.ok || !body?.ok) throw new Error(FEEDBACK_ERROR_MESSAGES[body?.error ?? ''] ?? FEEDBACK_FALLBACK_ERROR);

      const refNode = document.querySelector('[data-contact-ref]');
      if (refNode) refNode.textContent = body.ref || ref;
      form.reset();
      ref = newFeedbackRefAt(Math.floor(performance.timeOrigin + performance.now()));
      if (sent) {
        sent.hidden = false;
        sent.focus();
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : FEEDBACK_FALLBACK_ERROR);
    } finally {
      sending = false;
      submit.disabled = false;
      submit.textContent = SEND_LABEL;
    }
  });
}
