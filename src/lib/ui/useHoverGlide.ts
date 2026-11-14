import { useEffect, useRef, type RefObject } from 'react';
import { prefersReducedMotion } from './motion';

/**
 * Hover glide: one soft highlight that trails the pointer between the items of a list (sidebar
 * links, tabs). It travels on a critically damped spring, so a fast sweep down the list leaves it a
 * beat behind and it settles without bouncing; the first hover after entering places it at once
 * (nothing slides in from nowhere) and leaving the list fades it out where it stands. Keyboard focus
 * (:focus-visible) moves it too.
 *
 * The container must be positioned (relative) and contain the highlight element; items are
 * `[data-glide-item]` descendants. Mouse/trackpad and keyboard only: touch has no hover, so on a
 * touch-only device nothing is attached. Reduced motion jumps instead of travelling. The highlight
 * is painted from transform/height/width only (no layout per frame).
 *
 * Optional, for lists whose items never take focus (the dropdown's options: focus stays on its
 * button): the returned `moveTo(item)` moves the glide on demand (arrow keys, typeahead), and
 * `options` turn the hook on only while the list is mounted (`enabled`), keep the glide where it is
 * when the pointer leaves (`keepOnLeave`), and measure items by their layout offsets instead of
 * their on-screen boxes (`measure: 'offset'`: right inside a scaled/animating container). Callers
 * that pass no options and ignore the return value behave exactly as before.
 */
const STIFFNESS = 520;
const DAMPING = 2 * Math.sqrt(STIFFNESS); // critical: fastest settle with no overshoot
const REST = 0.15;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HoverGlideOptions {
  /** Attach only while true (default true); flip it when the container mounts/unmounts. */
  enabled?: boolean;
  /** Keep the glide on its item when the pointer leaves the container (default false: fade). */
  keepOnLeave?: boolean;
  /** 'rect' (default): on-screen boxes. 'offset': offsetTop/Left/Width/Height (item's offsetParent must be the container). */
  measure?: 'rect' | 'offset';
}

export interface HoverGlide {
  /** Move the glide to `item` (travel, or appear in place when hidden); `instant` jumps. */
  moveTo(item: HTMLElement, opts?: { instant?: boolean }): void;
  /** Fade the glide out where it stands. */
  hide(): void;
}

interface LiveGlide {
  moveTo(item: HTMLElement, instant: boolean): void;
  hide(): void;
}

export function useHoverGlide(
  containerRef: RefObject<HTMLElement>,
  glideRef: RefObject<HTMLElement>,
  options?: HoverGlideOptions
): HoverGlide {
  const enabled = options?.enabled ?? true;
  const keepOnLeave = options?.keepOnLeave ?? false;
  const measure = options?.measure ?? 'rect';
  const live = useRef<LiveGlide | null>(null);
  // A move asked for before the listeners attached (same commit as the list mounting).
  const pending = useRef<{ item: HTMLElement; instant: boolean } | null>(null);
  const api = useRef<HoverGlide | null>(null);
  if (!api.current) {
    api.current = {
      moveTo(item, opts) {
        const instant = Boolean(opts?.instant);
        if (live.current) live.current.moveTo(item, instant);
        else pending.current = { item, instant };
      },
      hide() {
        pending.current = null;
        live.current?.hide();
      },
    };
  }

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    const glide = glideRef.current;
    if (!container || !glide) return;
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    const pos: Box = { x: 0, y: 0, w: 0, h: 0 };
    const vel: Box = { x: 0, y: 0, w: 0, h: 0 };
    let target: Box | null = null;
    let visible = false;
    let frame = 0;
    let last = 0;

    const paint = () => {
      glide.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      glide.style.width = `${pos.w}px`;
      glide.style.height = `${pos.h}px`;
    };

    const step = (now: number) => {
      frame = 0;
      if (!target) return;
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      let moving = false;
      for (const k of ['x', 'y', 'w', 'h'] as const) {
        const force = STIFFNESS * (target[k] - pos[k]) - DAMPING * vel[k];
        vel[k] += force * dt;
        pos[k] += vel[k] * dt;
        if (Math.abs(target[k] - pos[k]) > REST || Math.abs(vel[k]) > REST) moving = true;
        else {
          pos[k] = target[k];
          vel[k] = 0;
        }
      }
      paint();
      if (moving) frame = requestAnimationFrame(step);
    };

    const boxOf = (item: HTMLElement): Box => {
      if (measure === 'offset')
        return { x: item.offsetLeft, y: item.offsetTop, w: item.offsetWidth, h: item.offsetHeight };
      const c = container.getBoundingClientRect();
      const r = item.getBoundingClientRect();
      return {
        x: r.left - c.left + container.scrollLeft,
        y: r.top - c.top + container.scrollTop,
        w: r.width,
        h: r.height,
      };
    };

    const moveTo = (item: HTMLElement, instant = false) => {
      target = boxOf(item);
      if (instant || !visible || prefersReducedMotion()) {
        cancelAnimationFrame(frame);
        frame = 0;
        // Appear in place: no travel from the last spot the list was left at.
        Object.assign(pos, target);
        Object.assign(vel, { x: 0, y: 0, w: 0, h: 0 });
        paint();
        visible = true;
        glide.dataset.visible = '';
        return;
      }
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(step);
      }
    };

    const hide = () => {
      visible = false;
      delete glide.dataset.visible;
    };

    const itemFrom = (node: EventTarget | null) =>
      node instanceof Element ? node.closest<HTMLElement>('[data-glide-item]') : null;

    const onOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const item = itemFrom(event.target);
      if (item && container.contains(item)) moveTo(item);
    };
    const onFocus = (event: FocusEvent) => {
      const item = itemFrom(event.target);
      if (item && item.matches(':focus-visible')) moveTo(item);
    };
    const onBlur = (event: FocusEvent) => {
      if (!container.contains(event.relatedTarget as Node | null) && !container.matches(':hover')) hide();
    };
    // A click can change the list (a group expands, the active pill moves); keep the glide on the
    // item under the pointer once React has re-rendered.
    const onClick = (event: MouseEvent) => {
      const item = itemFrom(event.target);
      if (item) requestAnimationFrame(() => item.isConnected && visible && moveTo(item));
    };

    live.current = { moveTo, hide };
    const asked = pending.current;
    pending.current = null;
    if (asked && asked.item.isConnected && container.contains(asked.item)) moveTo(asked.item, asked.instant);

    if (canHover) {
      container.addEventListener('pointerover', onOver);
      if (!keepOnLeave) container.addEventListener('pointerleave', hide);
      container.addEventListener('click', onClick);
    }
    container.addEventListener('focusin', onFocus);
    container.addEventListener('focusout', onBlur);
    return () => {
      live.current = null;
      cancelAnimationFrame(frame);
      container.removeEventListener('pointerover', onOver);
      container.removeEventListener('pointerleave', hide);
      container.removeEventListener('click', onClick);
      container.removeEventListener('focusin', onFocus);
      container.removeEventListener('focusout', onBlur);
    };
  }, [containerRef, glideRef, enabled, keepOnLeave, measure]);

  return api.current;
}
