import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AppState } from '@/types';
import { AuthClimbState, AuthPanel, AuthPanelMode, authPanelTitle } from '@/components/ui/AuthPanel';
import { authPathWithNext, nextFromSearch } from '@/lib/routes';
import { prefersReducedMotion } from '@/lib/motion';
import { CLIMB_PANEL_BG, ClimbPanel, ClimbPanelMode, ClimbPanelSide } from './ClimbPanel';

/** The screens of the sign-in pages: /login, /signup, and /signup for a guest (save progress). */
export type AuthScreen = AuthPanelMode;

const DOCUMENT_TITLES: Record<AuthScreen, string> = {
  login: 'Sign in · Ascend',
  signup: 'Create account · Ascend',
  upgrade: 'Save your progress · Ascend',
};

export interface AuthPageProps {
  screen: AuthScreen;
  /** The address bar's query; its `next` is where the user goes after signing in. */
  search: string;
  guestState: AppState;
  /** Called as the success screen starts; App keeps this page up until onDone. */
  onAuthSuccess: () => void;
  onDone: () => void;
  /** Follows an in-app link (a new history entry). */
  onNavigate: (path: string) => void;
}

/** The desktop split (Tailwind `lg`): below it the panel is a band above the form. */
const SPLIT_QUERY = '(min-width: 1024px)';
// The panel's share of the desktop width; the form column takes the rest. Moving a box across to
// the other side is a translate by the other box's width, in its own percent.
const PANEL_SHARE = 0.45;
/** The side swap and the success hand-off share one emphasized curve (index.css .auth-swap). */
const SWAP_EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const SWAP_MS = 550;
const HANDOFF_EXPAND_MS = 560;

/** Login keeps the panel on the left; signup and save-progress move it right (the slope faces the form). */
function sideFor(screen: AuthScreen): ClimbPanelSide {
  return screen === 'login' ? 'left' : 'right';
}

/**
 * What the panel shows. The form reports its state a render after a route change, so a report
 * that belongs to the previous page is ignored until the new one arrives.
 */
function panelState(screen: AuthScreen, climb: AuthClimbState | null) {
  const reported: ClimbPanelMode | null = climb
    ? climb.screen === 'signup-form'
      ? 'signup'
      : climb.screen
    : null;
  const fits =
    reported !== null &&
    (screen === 'signup' ? reported === 'signup' || reported === 'signup-choice' : reported === screen);
  // The error count is not per screen: it always passes through, so a route change never looks
  // like a new error.
  const errorTick = climb?.errorTick ?? 0;
  if (climb && fits && reported) {
    return {
      mode: reported,
      progress: climb.progress,
      phase: climb.phase,
      hoverTrail: climb.hoverTrail,
      avatar: climb.preview.avatar,
      focus: climb.focus,
      caret: climb.caret,
      passwordVisible: climb.passwordVisible,
      errorTick,
      upset: climb.upset,
    };
  }
  const mode: ClimbPanelMode = screen === 'signup' ? 'signup-choice' : screen;
  return {
    mode,
    progress: 0,
    phase: 'idle' as const,
    hoverTrail: null,
    avatar: '',
    focus: null,
    caret: 0,
    passwordVisible: false,
    errorTick,
    upset: false,
  };
}

/**
 * The panel's outline in viewport pixels, as eight points in ClimbPanel's slope order (a plain
 * rectangle for the phone band), so the hand-off layer can start exactly on the panel.
 */
function outlineOf(rect: DOMRect, side: ClimbPanelSide, split: boolean): string[] {
  const { left: l, right: r, top: t, bottom: b, height: h } = rect;
  const y38 = t + h * 0.38;
  const y62 = t + h * 0.62;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const [s1, s2, s3] = split ? [1.5 * rem, 3 * rem, 5 * rem] : [0, 0, 0];
  const pts =
    side === 'left'
      ? [[l, t], [r, t], [r - s1, y38], [r - s2, y62], [r - s3, b], [l, b], [l, y62], [l, y38]]
      : [[l, t], [r, t], [r, y38], [r, y62], [r, b], [l + s3, b], [l + s2, y62], [l + s1, y38]];
  return pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`);
}

function fullScreenOutline(): string[] {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pts = [[0, 0], [w, 0], [w, h * 0.38], [w, h * 0.62], [w, h], [0, h], [0, h * 0.62], [0, h * 0.38]];
  return pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`);
}

/**
 * The /login and /signup pages, outside the app shell ("The Climb"). Desktop: a full-screen split,
 * the emerald climb panel on one side and the form on the other; the panel crosses to the other
 * side when the page switches between sign in and sign up. Phones and tablets: the panel is a band
 * on top and the form a sheet below it. After a successful sign-in the panel floods the screen and
 * the app fades in from it.
 */
export function AuthPage({ screen, search, guestState, onAuthSuccess, onDone, onNavigate }: AuthPageProps) {
  const next = nextFromSearch(search);
  const links = {
    login: authPathWithNext('login', next),
    signup: authPathWithNext('signup', next),
    dismiss: next,
  };

  useEffect(() => {
    document.title = DOCUMENT_TITLES[screen];
  }, [screen]);

  // As the dialog did: with a mouse/keyboard the first text field takes focus so typing can start
  // at once; touch skips it (the on-screen keyboard would cover the page before the user chose).
  const formRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    formRef.current?.querySelector<HTMLInputElement>('input:not([type="hidden"]):not([type="checkbox"]):not([disabled])')?.focus();
  }, []);

  const [climb, setClimb] = useState<AuthClimbState | null>(null);
  const climbRef = useRef(climb);
  climbRef.current = climb;
  const panel = panelState(screen, climb);
  const side = sideFor(screen);

  // Side swap (desktop): the boxes glide on CSS transitions (.auth-swap); the form column also dips
  // in opacity on the way so its text never reads mid-flight under the passing panel.
  const shownSideRef = useRef(side);
  useLayoutEffect(() => {
    if (shownSideRef.current === side) return;
    shownSideRef.current = side;
    if (prefersReducedMotion() || !window.matchMedia(SPLIT_QUERY).matches) return;
    formRef.current?.animate(
      { opacity: [1, 0, 0, 1], offset: [0, 0.3, 0.55, 1] },
      { duration: SWAP_MS, easing: 'linear' }
    );
  }, [side]);

  // ---- Success hand-off -------------------------------------------------------------------
  // When the success screen is done, an emerald layer grows from the panel's outline to the whole
  // screen (the panel, with Ember cheering, stays on top), then the app fades in over it as a view
  // transition. onDone runs inside that transition, so the first frame the app renders is already
  // the new snapshot: no app shell before the flood, and the success screen is never cut short
  // (this only starts at onDone time). Guest starts (no success screen), reduced motion and the
  // upgrade (which reloads the page itself) go straight through.
  const panelBoxRef = useRef<HTMLDivElement>(null);
  const floodRef = useRef<HTMLDivElement>(null);
  const [handoff, setHandoff] = useState(false);
  const doneCalledRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const finish = useCallback(() => {
    if (doneCalledRef.current) return;
    doneCalledRef.current = true;
    const run = () => onDoneRef.current();
    if (typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
      run();
      return;
    }
    const root = document.documentElement;
    root.classList.add('vt-auth-handoff');
    try {
      const transition = document.startViewTransition(() => {
        flushSync(run);
      });
      transition.finished.finally(() => root.classList.remove('vt-auth-handoff'));
    } catch {
      root.classList.remove('vt-auth-handoff');
      run();
    }
  }, []);

  const handleDone = useCallback(() => {
    if (climbRef.current?.phase !== 'success' || prefersReducedMotion() || !panelBoxRef.current) {
      finish();
      return;
    }
    setHandoff(true);
  }, [finish]);

  useLayoutEffect(() => {
    if (!handoff) return;
    const box = panelBoxRef.current;
    const flood = floodRef.current;
    if (!box || !flood) {
      finish();
      return;
    }
    const split = window.matchMedia(SPLIT_QUERY).matches;
    const from = outlineOf(box.getBoundingClientRect(), shownSideRef.current, split);
    const to = fullScreenOutline();
    const animation = flood.animate(
      { clipPath: [`polygon(${from.join(',')})`, `polygon(${to.join(',')})`] },
      { duration: HANDOFF_EXPAND_MS, easing: SWAP_EASE, fill: 'forwards' }
    );
    animation.finished.then(finish, () => {
      // Cancelled (the page went away first): nothing left to hand off.
    });
    return () => animation.cancel();
  }, [handoff, finish]);

  const panelShift = `${((1 - PANEL_SHARE) / PANEL_SHARE) * 100}%`;
  const formShift = `${(PANEL_SHARE / (1 - PANEL_SHARE)) * 100}%`;

  return (
    <div
      className="auth-page relative isolate flex-1 lg:min-h-0 bg-bg-900 flex flex-col lg:block lg:overflow-hidden"
      style={{ '--auth-panel-shift': panelShift, '--auth-form-shift': formShift } as React.CSSProperties}
    >
      {/* Brand panel: a band on top below lg; the desktop split's emerald side at lg+. */}
      <div
        ref={panelBoxRef}
        data-side={side}
        className={`auth-swap relative shrink-0 lg:absolute lg:inset-y-0 lg:left-0 lg:w-[45%] ${
          handoff ? 'z-30' : 'z-0 lg:z-10'
        } ${side === 'right' ? 'lg:translate-x-[var(--auth-panel-shift)]' : ''}`}
      >
        <ClimbPanel
          mode={panel.mode}
          progress={panel.progress}
          phase={panel.phase}
          hoverTrail={panel.hoverTrail}
          avatar={panel.avatar}
          focus={panel.focus}
          caret={panel.caret}
          passwordVisible={panel.passwordVisible}
          errorTick={panel.errorTick}
          upset={panel.upset}
          side={side}
          className="auth-swap auth-band h-full lg:min-h-0"
        />
      </div>

      {/* The form: a sheet over the band's lower edge on phones, a centred column at lg+. */}
      <main
        ref={formRef}
        aria-labelledby="auth-page-title"
        className={`auth-swap relative z-10 -mt-5 flex-1 rounded-t-2xl bg-bg-900 pt-7 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] sm:pl-[max(2rem,env(safe-area-inset-left))] sm:pr-[max(2rem,env(safe-area-inset-right))] lg:absolute lg:inset-y-0 lg:left-0 lg:z-0 lg:mt-0 lg:w-[55%] lg:rounded-none lg:overflow-y-auto lg:px-12 lg:pt-[max(2.5rem,env(safe-area-inset-top))] lg:pb-[max(2.5rem,env(safe-area-inset-bottom))] ${
          side === 'left' ? 'lg:translate-x-[var(--auth-form-shift)]' : ''
        }`}
      >
        <div className="mx-auto w-full max-w-md lg:min-h-full lg:flex lg:flex-col lg:justify-center">
          <AuthPanel
            mode={screen}
            title={
              <h1 id="auth-page-title" className="text-2xl sm:text-3xl font-semibold tracking-tight text-content-primary">
                {authPanelTitle(screen)}
              </h1>
            }
            onAuthSuccess={onAuthSuccess}
            onDone={handleDone}
            guestState={guestState}
            pageLinks={{ ...links, navigate: onNavigate }}
            onClimbChange={setClimb}
            startForgot={new URLSearchParams(search).get('forgot') === '1'}
          />
        </div>
      </main>

      {/* Success hand-off: grows from the panel's outline to the whole screen (clip-path set on start). */}
      <div
        ref={floodRef}
        aria-hidden="true"
        className={`fixed inset-0 z-20 pointer-events-none ${handoff ? '' : 'hidden'}`}
        style={{ backgroundColor: CLIMB_PANEL_BG }}
      />
    </div>
  );
}
