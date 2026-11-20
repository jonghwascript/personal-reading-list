import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement scrolling; the app calls it on navigation.
if (typeof window !== 'undefined') window.scrollTo = (() => undefined) as typeof window.scrollTo;

// jsdom doesn't implement <dialog> modality; enough for tests to open and close dialogs.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
}
