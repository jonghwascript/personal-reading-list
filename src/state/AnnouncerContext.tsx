import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Toasts, type Toast } from '../components/Toasts/Toasts';

type Tone = 'info' | 'success' | 'error';

interface AnnouncerValue {
  /** Visible toast + screen reader announcement. Errors are announced assertively. */
  notify(message: string, tone?: Tone, action?: Toast['action']): void;
  /** Screen-reader-only announcement for changes that are already visible on screen. */
  announce(message: string): void;
}

const AnnouncerContext = createContext<AnnouncerValue | null>(null);

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  // Re-setting identical text wouldn't be re-announced; clearing first forces a fresh mutation.
  const speak = useCallback((text: string, assertively: boolean) => {
    const set = assertively ? setAssertive : setPolite;
    set('');
    window.setTimeout(() => set(text), 50);
  }, []);

  const value = useMemo<AnnouncerValue>(
    () => ({
      notify(message, tone = 'info', action) {
        const id = ++nextId.current;
        setToasts((list) => [...list.slice(-2), { id, message, tone, action }]);
        speak(message, tone === 'error');
        window.setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 5000);
      },
      announce(message) {
        speak(message, false);
      },
    }),
    [dismiss, speak],
  );

  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <Toasts toasts={toasts} onDismiss={dismiss} />
      <div className="u-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="u-sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnouncer(): AnnouncerValue {
  const ctx = useContext(AnnouncerContext);
  if (!ctx) throw new Error('useAnnouncer must be used inside <AnnouncerProvider>');
  return ctx;
}
