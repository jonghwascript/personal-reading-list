/**
 * Runs `fn` after the window's load event (plus `delay` ms), so work that isn't needed for the first
 * screen never competes with its first paint for bandwidth. Returns a cancel function.
 */
export function afterLoad(fn: () => void, delay = 0): () => void {
  let timer = 0;
  const schedule = () => {
    timer = window.setTimeout(fn, delay);
  };
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
  return () => {
    window.removeEventListener('load', schedule);
    window.clearTimeout(timer);
  };
}
