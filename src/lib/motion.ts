import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { useCallback, useLayoutEffect, useRef } from 'react';

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
