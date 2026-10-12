import { CSSProperties, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/motion';

export type EmberPhase = 'idle' | 'submitting' | 'success';
export type EmberRoute = 'account' | 'guest';
export type EmberFocus = 'email' | 'password' | 'confirm' | 'username' | null;

export interface EmberProps {
  /** Where the form sits next to the panel on the desktop split; below lg the form is always below. */
  formSide: 'left' | 'right';
  phase: EmberPhase;
  /** The form field that has focus. */
  focus: EmberFocus;
  /** Caret position in the focused text field, 0 (start) to 1 (end of the visible width). */
  caret: number;
  /** The focused password field shows its text. */
  passwordVisible: boolean;
  /** Goes up by one each time the form shows an error. */
  errorTick: number;
  /** Valid fields so far: Ember nods when it goes up. */
  progress: number;
  /** Signup choice: the option the pointer or focus is on. */
  hoverTrail: EmberRoute | null;
  /** Signup form: the chosen avatar, held up on a badge. */
  badge?: string;
  className?: string;
}

// ---- Drawing ---------------------------------------------------------------------------------
// viewBox 0 0 200 230. The flame stands in a low torch bowl; the face sits on the flame's belly.
// Arms are drawn for the viewer's left side and mirrored for the right, and they pivot at the
// shoulder: a pose is an angle (0 = hanging straight down, larger = swinging outward and up) and
// a length, so the hands always land exactly where a pose puts them (over the eyes, for one).

const BODY =
  'M100 200C66 200 46 180 46 152C46 124 62 106 76 92C88 80 96 66 94 44C93 38 91 33 88 28C106 36 122 52 128 72C131 66 132 60 131 54C146 70 154 100 154 140C154 176 132 200 100 200Z';

const C = {
  body: '#34D399',
  shade: '#22B47F',
  limb: '#1FA676',
  hand: '#A7F3D0',
  cheek: '#6EE7B7',
  ink: '#0B1F1C',
  bowl: '#1C5446',
  rim: '#2F8A6F',
  rimLight: '#4FB08F',
  badge: '#CDF2E5',
  panel: '#112725',
};

const EYE_L = { x: 84, y: 118 };
const EYE_R = { x: 116, y: 118 };
const SHOULDER = { x: 60, y: 152 };
const HAND_R = 14.5;

interface ArmPose {
  angle: number;
  length: number;
}

/** The pose that puts the (left-side) hand on a point. */
function reach(x: number, y: number): ArmPose {
  const dx = x - SHOULDER.x;
  const dy = y - SHOULDER.y;
  const angle = ((Math.atan2(-dx, dy) * 180) / Math.PI + 360) % 360;
  return { angle, length: Math.hypot(dx, dy) };
}

/** Where a (left-side) pose puts the hand. */
function handAt(pose: ArmPose) {
  const rad = (pose.angle * Math.PI) / 180;
  return { x: SHOULDER.x - pose.length * Math.sin(rad), y: SHOULDER.y + pose.length * Math.cos(rad) };
}

const COVER = reach(EYE_L.x, EYE_L.y);
const ARM = {
  rest: { angle: 10, length: COVER.length * 0.68 },
  cover: COVER,
  /** One hand drops to the cheek; the eye above it peeks out. */
  peek: reach(76, 144),
  cheer: { angle: 172, length: COVER.length * 1.24 },
  eager: { angle: 64, length: COVER.length },
  badge: { angle: 98, length: COVER.length * 0.9 },
} satisfies Record<string, ArmPose>;

const BADGE_HAND = handAt(ARM.badge);

type Eyes = 'open' | 'happy' | 'soft' | 'wide';
type Brows = 'none' | 'worried' | 'raised';
type Mouth = 'smile' | 'open' | 'worried' | 'o';

interface Pose {
  left: ArmPose;
  right: ArmPose;
  /** Lean of the whole flame, degrees (positive leans right). */
  tilt: number;
  /** Face shift toward the form, in viewBox units. */
  faceBias: number;
  /** Whether the face follows the gaze a little (off while the hands cover the eyes). */
  faceFollow: boolean;
  eyes: Eyes;
  brows: Brows;
  mouth: Mouth;
  badge: boolean;
  /** Where the pupils look, -1..1 each way, or 'pointer' to follow the mouse. */
  gaze: { x: number; y: number } | 'pointer';
}

const SPLIT_QUERY = '(min-width: 1024px)';
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function poseFor(
  p: Pick<EmberProps, 'phase' | 'focus' | 'caret' | 'passwordVisible' | 'hoverTrail' | 'badge'>,
  worried: boolean,
  split: boolean,
  finePointer: boolean,
  formSide: 'left' | 'right'
): Pose {
  // The direction of the form from Ember: sideways on the desktop split, straight down on phones.
  const fx = split ? (formSide === 'right' ? 1 : -1) : 0;
  const fy = split ? 0 : 1;
  // The hand nearest the form does the one-handed things (peek, badge); phones use the right one.
  const formHandRight = fx >= 0;

  const base: Pose = {
    left: ARM.rest,
    right: ARM.rest,
    tilt: fx * 2,
    faceBias: fx * 2,
    faceFollow: true,
    eyes: 'open',
    brows: 'none',
    mouth: 'smile',
    badge: false,
    gaze: split && finePointer ? 'pointer' : { x: 0, y: 0 },
  };
  let pose: Pose = base;

  const passwordFocus = p.focus === 'password' || p.focus === 'confirm';
  const textFocus = p.focus === 'email' || p.focus === 'username';

  if (p.phase === 'success') {
    pose = { ...base, left: ARM.cheer, right: ARM.cheer, tilt: 0, faceBias: 0, eyes: 'happy', mouth: 'open', gaze: { x: 0, y: -0.9 } };
  } else if (p.phase === 'submitting') {
    pose = { ...base, tilt: fx * 9, faceBias: fx * 3, brows: 'raised', mouth: 'o', gaze: { x: fx * 0.3, y: -1 } };
  } else if (passwordFocus && !p.passwordVisible) {
    pose = { ...base, left: ARM.cover, right: ARM.cover, tilt: -fx * 3, faceBias: 0, faceFollow: false, gaze: { x: 0, y: 0 } };
  } else if (passwordFocus) {
    pose = {
      ...base,
      left: formHandRight ? ARM.cover : ARM.peek,
      right: formHandRight ? ARM.peek : ARM.cover,
      tilt: fx * 4,
      faceBias: 0,
      faceFollow: false,
      mouth: 'o',
      gaze: { x: split ? fx : 0.2, y: split ? 0.4 : 0.9 },
    };
  } else if (textFocus) {
    // Left at the start of the field, right at the end, with the range shifted toward the form.
    const x = fx * 0.3 + (clamp(p.caret, 0, 1) * 2 - 1) * 0.7;
    pose = { ...base, tilt: fx * 5, faceBias: fx * 2, gaze: { x, y: split ? 0.35 : 0.85 } };
  } else if (p.hoverTrail === 'account') {
    pose = {
      ...base,
      left: ARM.eager,
      right: ARM.eager,
      tilt: fx * 7,
      faceBias: fx * 3,
      eyes: 'wide',
      brows: 'raised',
      mouth: 'open',
      gaze: split ? { x: fx, y: -0.15 } : { x: 0.2, y: fy },
    };
  } else if (p.hoverTrail === 'guest') {
    pose = { ...base, tilt: fx * 2, faceBias: fx * 2, eyes: 'soft', gaze: split ? { x: fx, y: 0.5 } : { x: 0, y: fy } };
  }

  // Signup form: the avatar badge goes in the form-side hand while that hand is free.
  const handsBusy = p.phase === 'success' || passwordFocus;
  if (p.badge && !handsBusy) {
    pose = { ...pose, badge: true, ...(formHandRight ? { right: ARM.badge } : { left: ARM.badge }) };
  }

  if (worried && p.phase !== 'success') {
    pose = { ...pose, brows: 'worried', mouth: 'worried', eyes: pose.eyes === 'happy' ? 'open' : pose.eyes };
  }
  return pose;
}

// ---- Motion ----------------------------------------------------------------------------------

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
/** A little overshoot for limbs, so the hands land with some life. */
const EASE_SPRING = 'cubic-bezier(0.34, 1.36, 0.64, 1)';
const GAZE_T = `transform 150ms ${EASE_OUT}`;
const POSE_T = `transform 320ms ${EASE_SPRING}`;
const FADE_T = 'opacity 140ms linear';
const WORRY_MS = 1100;

const origin = (x: number, y: number) => `${x}px ${y}px`;

function armStyle(pose: ArmPose): CSSProperties {
  return {
    transform: `translate(${SHOULDER.x}px, ${SHOULDER.y}px) rotate(${pose.angle.toFixed(2)}deg)`,
    transformOrigin: '0 0',
    transition: POSE_T,
  };
}

/** One arm, drawn for the viewer's left side (the right arm is this, mirrored). */
function Arm({ pose }: { pose: ArmPose }) {
  return (
    <g style={armStyle(pose)}>
      <circle r={6} fill={C.limb} />
      <rect
        x={-6}
        width={12}
        height={1}
        fill={C.limb}
        style={{ transform: `scaleY(${pose.length.toFixed(2)})`, transformOrigin: '0 0', transition: POSE_T }}
      />
      <g style={{ transform: `translateY(${pose.length.toFixed(2)}px)`, transformOrigin: '0 0', transition: POSE_T }}>
        <circle r={HAND_R} fill={C.hand} />
        <circle cx={-9} cy={-8} r={5} fill={C.hand} />
      </g>
    </g>
  );
}

function Eye({ cx, cy, eyes, blinkRef }: { cx: number; cy: number; eyes: Eyes; blinkRef: React.Ref<SVGGElement> }) {
  const scale = eyes === 'wide' ? 'scale(1.08)' : eyes === 'soft' ? 'scale(1, 0.72)' : 'none';
  return (
    <g style={{ opacity: eyes === 'happy' ? 0 : 1, transition: FADE_T }}>
      <g style={{ transform: scale, transformOrigin: origin(cx, cy + 6), transition: POSE_T }}>
        <g ref={blinkRef} style={{ transformOrigin: origin(cx, cy) }}>
          <ellipse cx={cx} cy={cy} rx={11} ry={13} fill="#fff" />
          <g
            style={{
              transform: 'translate(calc(var(--ember-gx, 0) * 4.6px), calc(var(--ember-gy, 0) * 5.4px))',
              transition: GAZE_T,
            }}
          >
            <circle cx={cx} cy={cy} r={6.2} fill={C.ink} />
            <circle cx={cx - 1.9} cy={cy - 2.3} r={1.9} fill="#fff" />
          </g>
        </g>
      </g>
    </g>
  );
}

function Brow({ cx, side, brows }: { cx: number; side: 1 | -1; brows: Brows }) {
  // side: -1 left brow, 1 right brow. Worried lifts the inner ends; raised lifts both.
  const t =
    brows === 'worried'
      ? `translateY(-1px) rotate(${side * 16}deg)`
      : brows === 'raised'
        ? 'translateY(-4px)'
        : 'translateY(3px)';
  return (
    <g style={{ opacity: brows === 'none' ? 0 : 1, transform: t, transformOrigin: origin(cx, 99), transition: `${POSE_T}, ${FADE_T}` }}>
      <path d={`M${cx - 7} 99H${cx + 7}`} stroke={C.ink} strokeWidth={3.4} strokeLinecap="round" />
    </g>
  );
}

const MOUTHS: Record<Mouth, React.ReactNode> = {
  smile: <path d="M91 141Q100 150 109 141" stroke={C.ink} strokeWidth={3.6} fill="none" strokeLinecap="round" />,
  open: <path d="M89.5 140.5Q100 139 110.5 140.5Q109.5 155 100 155Q90.5 155 89.5 140.5Z" fill={C.ink} />,
  worried: (
    <path d="M91 146.5Q95.5 142 100 145Q104.5 148 109 143.5" stroke={C.ink} strokeWidth={3.4} fill="none" strokeLinecap="round" />
  ),
  o: <ellipse cx={100} cy={145} rx={4.2} ry={5} fill={C.ink} />,
};

/**
 * Ember, the sign-in pages' mascot: a small emerald flame in a torch bowl that reacts to the form
 * (looks along what is typed, covers its eyes for a password, peeks when it is shown, nods at a
 * valid field, shakes at an error, cheers on success). Input-driven only: nothing moves on a timer.
 * Decorative (aria-hidden). Reduced motion: no pointer following or one-off moves; poses switch
 * instantly (the global reduced-motion rule zeroes the transitions).
 */
export function Ember({
  formSide,
  phase,
  focus,
  caret,
  passwordVisible,
  errorTick,
  progress,
  hoverTrail,
  badge,
  className = '',
}: EmberProps) {
  const reduced = useReducedMotion();
  const split = useMedia(SPLIT_QUERY);
  const finePointer = useMedia(FINE_POINTER_QUERY);
  const clipId = `ember-${useId().replace(/:/g, '')}`;

  const svgRef = useRef<SVGSVGElement>(null);
  const hopRef = useRef<SVGGElement>(null);
  const shakeRef = useRef<SVGGElement>(null);
  const turnRef = useRef<SVGGElement>(null);
  const flameRef = useRef<SVGGElement>(null);
  const blinkL = useRef<SVGGElement>(null);
  const blinkR = useRef<SVGGElement>(null);

  // Worried brows for a moment after each error (a reaction, not a loop).
  const [worried, setWorried] = useState(false);
  const lastErrorTick = useRef(errorTick);
  useEffect(() => {
    if (errorTick === lastErrorTick.current) return;
    const rose = errorTick > lastErrorTick.current;
    lastErrorTick.current = errorTick;
    if (!rose) return;
    setWorried(true);
    if (!reduced) {
      shakeRef.current?.animate(
        [
          { transform: 'none' },
          { transform: 'translateX(-7px) rotate(-4deg)' },
          { transform: 'translateX(6px) rotate(3deg)' },
          { transform: 'translateX(-4px) rotate(-2deg)' },
          { transform: 'translateX(2px) rotate(1deg)' },
          { transform: 'none' },
        ],
        { duration: 420, easing: 'ease-in-out' }
      );
    }
    const timer = window.setTimeout(() => setWorried(false), WORRY_MS);
    return () => window.clearTimeout(timer);
  }, [errorTick, reduced]);

  const pose = poseFor({ phase, focus, caret, passwordVisible, hoverTrail, badge }, worried, split, finePointer, formSide);

  // ---- One-off reactions (WAAPI; skipped under reduced motion) ----
  const lastProgress = useRef(progress);
  useEffect(() => {
    const rose = progress > lastProgress.current;
    lastProgress.current = progress;
    if (!rose || reduced || phase !== 'idle') return;
    hopRef.current?.animate(
      [{ transform: 'none' }, { transform: 'translateY(4px) scaleY(0.96)' }, { transform: 'none' }],
      { duration: 340, easing: 'ease-in-out' }
    );
  }, [progress, phase, reduced]);

  const lastPhase = useRef(phase);
  useEffect(() => {
    const was = lastPhase.current;
    lastPhase.current = phase;
    if (phase !== 'success' || was === 'success' || reduced) return;
    hopRef.current?.animate(
      [
        { transform: 'none', easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
        { transform: 'translateY(-20px)', offset: 0.4, easing: 'cubic-bezier(0.6, 0, 0.8, 0.4)' },
        { transform: 'translateY(0) scaleY(0.94)', offset: 0.75 },
        { transform: 'none' },
      ],
      { duration: 620 }
    );
    flameRef.current?.animate(
      [{ transform: 'none' }, { transform: 'scale(0.96, 1.22)', offset: 0.45 }, { transform: 'scale(1.02, 1.08)' }],
      { duration: 640, easing: EASE_OUT, fill: 'forwards' }
    );
  }, [phase, reduced]);

  // A blink when focus moves from one field to another (eyes not covered).
  const lastFocus = useRef(focus);
  useEffect(() => {
    const was = lastFocus.current;
    lastFocus.current = focus;
    if (reduced || !was || !focus || was === focus) return;
    if (focus === 'password' || focus === 'confirm') return;
    const blink = [{ transform: 'none' }, { transform: 'scaleY(0.1)', offset: 0.45 }, { transform: 'none' }];
    blinkL.current?.animate(blink, { duration: 180, easing: 'ease-in-out' });
    blinkR.current?.animate(blink, { duration: 180, easing: 'ease-in-out' });
  }, [focus, reduced]);

  // Panel side swap: a quick turn toward the form's new side (the lean itself transitions).
  const lastSide = useRef(formSide);
  useEffect(() => {
    if (lastSide.current === formSide) return;
    lastSide.current = formSide;
    if (reduced || !split) return;
    turnRef.current?.animate(
      [{ transform: 'none' }, { transform: 'scaleX(0.84)', offset: 0.5 }, { transform: 'none' }],
      { duration: 460, easing: 'ease-in-out' }
    );
  }, [formSide, split, reduced]);

  // ---- Gaze: a target from the pose, or the mouse pointer (desktop, no reduced motion) ----
  const gaze = pose.gaze;
  const gazeX = gaze === 'pointer' ? null : gaze.x;
  const gazeY = gaze === 'pointer' ? null : gaze.y;
  const followPointer = gaze === 'pointer' && !reduced;
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (gazeX !== null && gazeY !== null) {
      svg.style.setProperty('--ember-gx', gazeX.toFixed(3));
      svg.style.setProperty('--ember-gy', gazeY.toFixed(3));
      return;
    }
    svg.style.setProperty('--ember-gx', '0');
    svg.style.setProperty('--ember-gy', '0');
    if (!followPointer) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const update = () => {
      frame = 0;
      if (!last) return;
      const rect = svg.getBoundingClientRect();
      const dx = last.clientX - (rect.left + rect.width * 0.5);
      const dy = last.clientY - (rect.top + rect.height * 0.51);
      const dist = Math.hypot(dx, dy) || 1;
      const reachK = Math.min(1, dist / 260);
      svg.style.setProperty('--ember-gx', ((dx / dist) * reachK).toFixed(3));
      svg.style.setProperty('--ember-gy', ((dy / dist) * reachK).toFixed(3));
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      last = event;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onLeave = () => {
      last = null;
      svg.style.setProperty('--ember-gx', '0');
      svg.style.setProperty('--ember-gy', '0');
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [gazeX, gazeY, followPointer]);

  const tiltK = gaze === 'pointer' && !reduced ? 1 : 0;
  const leanStyle: CSSProperties = {
    transform: `rotate(calc(${pose.tilt}deg + var(--ember-gx, 0) * ${tiltK * 3}deg))`,
    transformOrigin: origin(100, 205),
    transition: POSE_T,
  };
  const faceK = pose.faceFollow ? 1 : 0;
  const faceStyle: CSSProperties = {
    transform: `translate(calc(${pose.faceBias}px + var(--ember-gx, 0) * ${faceK * 2.5}px), calc(var(--ember-gy, 0) * ${faceK * 2}px))`,
    transition: `transform 220ms ${EASE_OUT}`,
  };

  // Badge position: above the form-side hand in its badge pose.
  const formHandRight = !split || formSide === 'right';
  const badgeX = formHandRight ? 200 - BADGE_HAND.x : BADGE_HAND.x;
  const badgeY = BADGE_HAND.y - 25;

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 200 230"
      className={`overflow-visible select-none ${className}`}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={BODY} />
        </clipPath>
      </defs>
      <g ref={hopRef} style={{ transformOrigin: origin(100, 215) }}>
        <g ref={shakeRef} style={{ transformOrigin: origin(100, 205) }}>
          <g ref={turnRef} style={{ transformOrigin: origin(100, 0) }}>
            {/* Flame, face (behind the bowl's rim) */}
            <g style={leanStyle}>
              <g ref={flameRef} style={{ transformOrigin: origin(100, 200) }}>
                <g clipPath={`url(#${clipId})`}>
                  <rect width={200} height={230} fill={C.shade} />
                  <path d={BODY} transform="translate(-9 -3)" fill={C.body} />
                </g>
              </g>
              <g style={faceStyle}>
                <ellipse cx={70} cy={138} rx={7} ry={4.5} fill={C.cheek} />
                <ellipse cx={130} cy={138} rx={7} ry={4.5} fill={C.cheek} />
                <Eye cx={EYE_L.x} cy={EYE_L.y} eyes={pose.eyes} blinkRef={blinkL} />
                <Eye cx={EYE_R.x} cy={EYE_R.y} eyes={pose.eyes} blinkRef={blinkR} />
                <g style={{ opacity: pose.eyes === 'happy' ? 1 : 0, transition: FADE_T }}>
                  <path d="M74 121Q84 109 94 121" stroke={C.ink} strokeWidth={3.8} fill="none" strokeLinecap="round" />
                  <path d="M106 121Q116 109 126 121" stroke={C.ink} strokeWidth={3.8} fill="none" strokeLinecap="round" />
                </g>
                <Brow cx={EYE_L.x} side={-1} brows={pose.brows} />
                <Brow cx={EYE_R.x} side={1} brows={pose.brows} />
                {(Object.keys(MOUTHS) as Mouth[]).map((m) => (
                  <g key={m} style={{ opacity: pose.mouth === m ? 1 : 0, transition: FADE_T }}>
                    {MOUTHS[m]}
                  </g>
                ))}
              </g>
            </g>

            {/* Torch bowl (does not lean) */}
            <path d="M58 194H142L136 211Q134.5 215 130.5 215H69.5Q65.5 215 64 211Z" fill={C.bowl} />
            <rect x={50} y={186} width={100} height={10} rx={5} fill={C.rim} />
            <rect x={58} y={187.5} width={60} height={2} rx={1} fill={C.rimLight} opacity={0.7} />

            {/* Arms and badge, in front of the face and bowl, leaning with the flame */}
            <g style={leanStyle}>
              <g
                style={{
                  opacity: pose.badge ? 1 : 0,
                  transform: pose.badge ? 'none' : 'translateY(10px) scale(0.6)',
                  transformOrigin: origin(badgeX, badgeY + 19),
                  transition: `${POSE_T}, ${FADE_T}`,
                }}
              >
                <circle cx={badgeX} cy={badgeY} r={19} fill={C.badge} stroke={C.panel} strokeWidth={3} />
                {badge && (
                  <text key={badge} x={badgeX} y={badgeY + 7} fontSize={20} textAnchor="middle" className="animate-pop" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
                    {badge}
                  </text>
                )}
              </g>
              <Arm pose={pose.left} />
              <g transform="translate(200 0) scale(-1 1)">
                <Arm pose={pose.right} />
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
