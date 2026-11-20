import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/*
 * GSAP is used for choreography CSS can't express well: grid re-layout (Flip), scroll-driven
 * storytelling (ScrollTrigger, registered in the year-review chunk only) and the landing intro.
 * Hovers and simple transitions stay in CSS.
 */
gsap.registerPlugin(useGSAP, Flip);

export { gsap, Flip, useGSAP };

/**
 * Motion is opt-in by environment: off under prefers-reduced-motion, and off where there's no
 * matchMedia (jsdom in tests) so animations never leave elements mid-tween.
 */
export function canAnimate(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    const tween = gsap.fromTo(
      nodes.slice(0, STAGGER_LIMIT),
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', stagger: 0.03, clearProps: 'opacity,transform' },
    );
    return () => {
      // Cleaned up before finishing (React StrictMode's mount→unmount→mount in dev, or a new page of
      // results mid-animation): forget these ids so the next run animates them instead of skipping.
      if (tween.progress() < 1) fresh.forEach((id) => seen.current.ids.delete(id));
      tween.revert();
    };
    // `signature` stands in for `ids`, whose array identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, resetKey]);
}

/** A short fade (and optional rise) whenever `key` changes to a non-empty value. */
export function useEnterOnChange<T extends HTMLElement>(ref: RefObject<T | null>, key: string, vars: gsap.TweenVars = {}) {
  useLayoutEffect(() => {
    if (!key || !ref.current || !canAnimate()) return;
    const tween = gsap.from(ref.current, { opacity: 0, duration: 0.25, ease: 'power2.out', clearProps: 'opacity,transform', ...vars });
    return () => {
      tween.revert();
    };
    // vars is a style literal from the caller; only a new key should restart the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/**
 * Drives a native <dialog> from an `open` flag with GSAP enter/exit motion: the panel eases up
 * while the backdrop fades in (via the --backdrop-opacity variable its ::backdrop reads), and on
 * close it sinks away *before* dialog.close() runs, then `onClosed` lets the parent unmount it.
 * Without motion (reduced motion, tests) it opens and closes instantly.
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
    let tween: gsap.core.Tween | null = null;

    if (open) {
      if (!dialog.open) dialog.showModal();
      if (!shown.current && canAnimate()) {
        tween = gsap.fromTo(
          dialog,
          { opacity: 0, y: 12, scale: 0.98, '--backdrop-opacity': 0 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            '--backdrop-opacity': 1,
            duration: 0.2,
            // A smooth deceleration: an overshoot squeezed into 0.2s reads as a jolt, not a spring.
            ease: 'power3.out',
            onComplete: () => {
              shown.current = true;
              gsap.set(dialog, { clearProps: 'all' });
            },
          },
        );
      } else {
        shown.current = true;
      }
    } else if (dialog.open) {
      shown.current = false;
      const finish = () => {
        if (dialog.open) dialog.close();
        gsap.set(dialog, { clearProps: 'all' });
        onClosedRef.current?.();
      };
      if (canAnimate()) {
        tween = gsap.to(dialog, { opacity: 0, y: 8, scale: 0.98, '--backdrop-opacity': 0, duration: 0.16, ease: 'power2.in', onComplete: finish });
      } else {
        finish();
      }
    }

    return () => {
      if (!tween) return;
      tween.kill();
      gsap.set(dialog, { clearProps: 'all' });
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
 * that re-orders or filters them; after React re-renders, items glide to their new places and new
 * arrivals fade in.
 */
export function useFlipGrid<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const pending = useRef<Flip.FlipState | null>(null);

  const capture = useCallback(() => {
    if (!ref.current || !canAnimate()) return;
    pending.current = Flip.getState(ref.current.querySelectorAll('[data-flip-id]'));
  }, []);

  // Runs after every commit, but only acts when a capture is waiting.
  useLayoutEffect(() => {
    const state = pending.current;
    if (!state || !ref.current) return;
    pending.current = null;
    Flip.from(state, {
      targets: ref.current.querySelectorAll('[data-flip-id]'),
      duration: 0.55,
      ease: 'power2.inOut',
      stagger: 0.012,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'power2.out' }),
    });
  });

  return { ref, capture };
}
