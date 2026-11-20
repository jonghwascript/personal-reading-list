import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { RefObject } from 'react';
import { canAnimate } from '../../lib/motion';

// GSAP and ScrollTrigger are imported here so they ship only in the year-review chunk. ScrollTrigger
// is *registered* lazily inside the hook: registration touches window.matchMedia, which doesn't exist
// in jsdom (tests).
gsap.registerPlugin(useGSAP);

/** Counts an element's text from 0 up to its data-count value (the real number stays in the DOM). */
function countUp(el: Element, scrollTrigger?: ScrollTrigger.Vars) {
  const target = Number((el as HTMLElement).dataset.count ?? el.textContent);
  if (!Number.isFinite(target)) return;
  const counter = { value: 0 };
  gsap.to(counter, {
    value: target,
    duration: Math.min(1.6, 0.6 + target / 40),
    ease: 'power2.out',
    scrollTrigger,
    onUpdate: () => {
      el.textContent = Math.round(counter.value).toLocaleString();
    },
  });
}

/**
 * The year in review as a scroll story (Spotify-Wrapped-ish, but calm):
 * - the headline number counts up on arrival
 * - month bars grow from the baseline as the chart scrolls in
 * - genre bars fill and the page total counts up when their cards appear
 * - each month of the "every book" list rises into place
 * Animated numbers are aria-hidden duplicates; screen readers get the final value immediately.
 */
export function useReviewMotion(scope: RefObject<HTMLElement | null>, key: string) {
  useGSAP(
    () => {
      if (!canAnimate()) return;
      gsap.registerPlugin(ScrollTrigger); // idempotent
      const q = gsap.utils.selector(scope);

      q('[data-anim="count"]').forEach((el) => countUp(el));

      const chart = q('[data-anim="chart"]')[0];
      if (chart) {
        gsap.from(q('[data-anim="bar"]'), {
          scaleY: 0,
          transformOrigin: '50% 100%',
          duration: 0.7,
          ease: 'back.out(1.6)',
          stagger: 0.05,
          scrollTrigger: { trigger: chart, start: 'top 85%' },
        });
      }

      q('[data-anim="genre"]').forEach((el, i) => {
        gsap.from(el, {
          scaleX: 0,
          transformOrigin: '0% 50%',
          duration: 0.8,
          delay: i * 0.08,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 90%' },
        });
      });

      q('[data-anim="count-on-scroll"]').forEach((el) => countUp(el, { trigger: el, start: 'top 90%' }));

      q('[data-anim="reveal"]').forEach((el) => {
        gsap.from(el, {
          y: 28,
          opacity: 0,
          duration: 0.6,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 88%' },
        });
      });
    },
    { scope, dependencies: [key], revertOnUpdate: true },
  );
}
