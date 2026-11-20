import { useCallback, useEffect, useLayoutEffect, useRef, type MouseEvent, type RefObject } from 'react';
import { flushSync } from 'react-dom';

/*
 * Everyday motion runs on the browser's own Web Animations API (element.animate), so no animation
 * library sits on the first paint's critical path. GSAP is used only for scroll-driven storytelling
 * (ScrollTrigger: the year in review, and the landing chapters, which fetch it after load).
 * Hovers and simple transitions stay in CSS.
 */

/** GSAP's eases, as CSS cubic-béziers. */
export const EASE = {
  out: 'cubic-bezier(0.33, 1, 0.68, 1)', // power2.out
  outStrong: 'cubic-bezier(0.22, 1, 0.36, 1)', // power3.out
  in: 'cubic-bezier(0.32, 0, 0.67, 0)', // power2.in
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)', // power2.inOut
  back: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // back.out
} as const;

/**
 * Motion is opt-in by environment: off under prefers-reduced-motion, and off where there's no
 * matchMedia or Element.animate (jsdom in tests) so animations never leave elements mid-tween.
 */
export function canAnimate(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    typeof Element !== 'undefined' &&
    typeof Element.prototype.animate === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Most items animated in one stagger; anything after appears at once so long lists aren't slow. */
const STAGGER_LIMIT = 12;

/**
 * Staggers in only the items that weren't there last render — the whole list for a new search,
 * just the appended page for "Load more". Items carry `data-enter-id`; `resetKey` (e.g. the query)
 * forgets what was seen. Short and quick on purpose: results are a task, not a show.
 */
export function useEnterStagger<T extends HTMLElement>(ref: RefObject<T | null>, ids: string[], resetKey: string) {
  const seen = useRef<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() });
  const signature = ids.join('|');

  useLayoutEffect(() => {
    if (seen.current.key !== resetKey) seen.current = { key: resetKey, ids: new Set() };
    const fresh = new Set(ids.filter((id) => !seen.current.ids.has(id)));
    ids.forEach((id) => seen.current.ids.add(id));
    const root = ref.current;
    if (!root || fresh.size === 0 || !canAnimate()) return;
    const nodes = [...root.querySelectorAll<HTMLElement>('[data-enter-id]')].filter((n) => fresh.has(n.dataset.enterId ?? ''));
    const animations = nodes.slice(0, STAGGER_LIMIT).map((node, i) =>
      node.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], {
        duration: 300,
        delay: i * 30,
        easing: EASE.out,
        fill: 'backwards',
      }),
    );
    return () => {
      // Cleaned up before finishing (React StrictMode's mount→unmount→mount in dev, or a new page of
      // results mid-animation): forget these ids so the next run animates them instead of skipping.
      if (animations.some((a) => a.playState !== 'finished')) fresh.forEach((id) => seen.current.ids.delete(id));
      animations.forEach((a) => a.cancel());
    };
    // `signature` stands in for `ids`, whose array identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, resetKey]);
}

/** A short fade (and optional rise, in px) whenever `key` changes to a non-empty value. Duration in seconds. */
export function useEnterOnChange<T extends HTMLElement>(ref: RefObject<T | null>, key: string, vars: { y?: number; duration?: number } = {}) {
  useLayoutEffect(() => {
    if (!key || !ref.current || !canAnimate()) return;
    const { y = 0, duration = 0.25 } = vars;
    const animation = ref.current.animate([{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: 'none' }], {
      duration: duration * 1000,
      easing: EASE.out,
    });
    return () => animation.cancel();
    // vars is a style literal from the caller; only a new key should restart the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/**
 * Drives a native <dialog> from an `open` flag with enter/exit motion: the panel eases up while the
 * backdrop fades in (via the --backdrop-opacity property its ::backdrop reads, registered with
 * @property in global.css so it can be animated), and on close it sinks away *before*
 * dialog.close() runs, then `onClosed` lets the parent unmount it. Without motion (reduced motion,
 * tests) it opens and closes instantly.
 */
export function useAnimatedDialog(open: boolean, onClosed?: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  // Whether the enter animation finished for the current opening. React StrictMode (dev) runs
  // effects twice; an enter cut short by that cleanup is simply replayed instead of left at opacity 0.
  const shown = useRef(false);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    let animation: Animation | null = null;

    if (open) {
      if (!dialog.open) dialog.showModal();
      if (!shown.current && canAnimate()) {
        animation = dialog.animate(
          [
            { opacity: 0, transform: 'translateY(12px) scale(0.98)', '--backdrop-opacity': 0 },
            { opacity: 1, transform: 'none', '--backdrop-opacity': 1 },
          ],
          // A smooth deceleration: an overshoot squeezed into 0.2s reads as a jolt, not a spring.
          { duration: 200, easing: EASE.outStrong },
        );
        animation.onfinish = () => {
          shown.current = true;
        };
      } else {
        shown.current = true;
      }
    } else if (dialog.open) {
      shown.current = false;
      const finish = () => {
        if (dialog.open) dialog.close();
        onClosedRef.current?.();
      };
      if (canAnimate()) {
        animation = dialog.animate(
          [
            { opacity: 1, transform: 'none', '--backdrop-opacity': 1 },
            { opacity: 0, transform: 'translateY(8px) scale(0.98)', '--backdrop-opacity': 0 },
          ],
          { duration: 160, easing: EASE.in, fill: 'forwards' },
        );
        animation.onfinish = () => {
          finish();
          animation?.cancel(); // drop the held end state so the next opening starts clean
        };
      } else {
        finish();
      }
    }

    return () => {
      if (!animation || animation.playState === 'finished') return;
      animation.onfinish = null;
      animation.cancel();
    };
  }, [open]);

  // Unmounted while open (e.g. navigating away): close it so the page isn't left inert.
  useEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return ref;
}

/**
 * FLIP for a grid of items marked `data-flip-id`: call `capture()` right before the state change
 * that re-orders or filters them; after React re-renders, each item glides from where it was to
 * where it is now, and new arrivals fade in.
 */
export function useFlipGrid<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const pending = useRef<Map<string, DOMRect> | null>(null);

  const capture = useCallback(() => {
    if (!ref.current || !canAnimate()) return;
    const rects = new Map<string, DOMRect>();
    ref.current.querySelectorAll<HTMLElement>('[data-flip-id]').forEach((el) => rects.set(el.dataset.flipId!, el.getBoundingClientRect()));
    pending.current = rects;
  }, []);

  // Runs after every commit, but only acts when a capture is waiting.
  useLayoutEffect(() => {
    const before = pending.current;
    if (!before || !ref.current) return;
    pending.current = null;
    let moved = 0;
    ref.current.querySelectorAll<HTMLElement>('[data-flip-id]').forEach((el) => {
      const was = before.get(el.dataset.flipId!);
      if (!was) {
        el.animate([{ opacity: 0, transform: 'scale(0.85)' }, { opacity: 1, transform: 'none' }], { duration: 400, easing: EASE.out });
        return;
      }
      const now = el.getBoundingClientRect();
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: 550,
        delay: moved++ * 12,
        easing: EASE.inOut,
        fill: 'backwards',
      });
    });
  });

  return { ref, capture };
}

/** The view-transition-name shared by the book you open and the cover on its detail page. */
export const COVER_TRANSITION = 'book-cover';

/**
 * Opening a book from a shelf: the cover (or spine) you clicked is pulled off the shelf and becomes
 * the detail page's cover, via the View Transitions API. Call from the link's onClick; it takes
 * over the navigation only when it can animate (supported browser, motion allowed, a plain click)
 * and otherwise leaves the link to navigate as usual. The detail page is a lazy chunk, so the
 * transition waits for its cover (`data-cover-target`) to render before the browser captures it.
 */
export function openWithCoverTransition(e: MouseEvent<HTMLAnchorElement>, open: () => void) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const source = e.currentTarget.querySelector<HTMLElement>('[data-cover-source]');
  if (!source || typeof document.startViewTransition !== 'function' || !canAnimate()) return;
  e.preventDefault();
  source.style.viewTransitionName = COVER_TRANSITION;
  document.startViewTransition(async () => {
    source.style.viewTransitionName = '';
    flushSync(open);
    await waitFor(() => document.querySelector('[data-cover-target]') !== null, 1500);
  });
}

function waitFor(check: () => boolean, timeoutMs: number): Promise<void> {
  const start = performance.now();
  return new Promise((resolve) => {
    const tick = () => (check() || performance.now() - start > timeoutMs ? resolve() : requestAnimationFrame(tick));
    tick();
  });
}
