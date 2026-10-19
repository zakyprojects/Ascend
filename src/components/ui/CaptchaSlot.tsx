import { useEffect, useRef } from 'react';
import { registerCaptchaSlot } from '@/lib/captcha';

/**
 * Where the bot check's click challenge appears in this form, if Cloudflare asks for one. Place it
 * just above the submit button. `contents`: no box of its own, so the form's spacing and layout
 * stay exactly as they are until a challenge shows.
 */
export function CaptchaSlot() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => (ref.current ? registerCaptchaSlot(ref.current) : undefined), []);
  return <div ref={ref} className="contents" />;
}
