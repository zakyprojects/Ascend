/**
 * Who to call in a crisis, Pakistan first (most users). Shown in the Recovery page's disclaimer and
 * Emergency dialog (components/views/AddictionRecovery.tsx) and on the public /features/recovery
 * page, so both always list the same numbers. No opening hours are claimed here.
 */
export interface CrisisLine {
  place: string;
  name: string;
  /** As people read it. */
  number: string;
  /** For the `tel:` link. */
  tel: string;
  note?: string;
}

export const CRISIS_LINES: readonly CrisisLine[] = [
  { place: 'Pakistan', name: 'Rescue', number: '1122', tel: '1122', note: 'emergency' },
  { place: 'Pakistan', name: 'Umang', number: '0311 7786264', tel: '+923117786264', note: 'free mental health helpline' },
  { place: 'US', name: 'SAMHSA Helpline', number: '1-800-662-4357', tel: '+18006624357' },
];

/** The last line under the numbers, for every other country. */
export const CRISIS_ELSEWHERE = 'Elsewhere: call your local emergency number.';
