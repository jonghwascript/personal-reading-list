import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement scrolling; the app calls it on navigation.
if (typeof window !== 'undefined') window.scrollTo = (() => undefined) as typeof window.scrollTo;
