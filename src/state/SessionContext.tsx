import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { GuestRepository } from '../data/guestRepository';
import type { LibraryRepository } from '../data/repository';
import { SupabaseRepository } from '../data/supabaseRepository';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

export type SessionStatus = 'loading' | 'signed-out' | 'guest' | 'account';

interface SessionValue {
  status: SessionStatus;
  user: User | null;
  repository: LibraryRepository | null;
  authAvailable: boolean;
  startGuest(): void;
  /** Leaves guest mode and discards the session's guest library. */
  endGuest(): void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);
const MODE_KEY = 'bookshelf:mode';

function readGuestFlag(): boolean {
  try {
    return sessionStorage.getItem(MODE_KEY) === 'guest';
  } catch {
    return false;
  }
}

function writeGuestFlag(on: boolean) {
  try {
    if (on) sessionStorage.setItem(MODE_KEY, 'guest');
    else sessionStorage.removeItem(MODE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Absolute URL of an app route, including the deploy base path — auth emails must link back to
 * e.g. https://user.github.io/personal-reading-list/library, not the domain root.
 */
function appUrl(route: string): string {
  return new URL(`${import.meta.env.BASE_URL}${route}`, window.location.origin).href;
}

async function auth() {
  const pending = getSupabase();
  if (!pending) throw new Error('Accounts are not configured for this deployment. Try the guest library instead.');
  return (await pending).auth;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [guest, setGuest] = useState(readGuestFlag);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    const pending = getSupabase();
    if (!pending) return;
    let unsubscribe = () => {};
    let cancelled = false;
    pending
      .then(async (sb) => {
        if (cancelled) return;
        setClient(sb);
        const { data } = await sb.auth.getSession();
        if (cancelled) return;
        setSession(data.session);
        const sub = sb.auth.onAuthStateChange((_event, next) => setSession(next));
        unsubscribe = () => sub.data.subscription.unsubscribe();
      })
      .catch(() => undefined) // SDK failed to load (offline): carry on as signed-out/guest.
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const user = session?.user ?? null;
  // Guests never wait on the auth SDK; everyone else waits until we know whether they're signed in.
  const status: SessionStatus = user ? 'account' : guest ? 'guest' : !authReady ? 'loading' : 'signed-out';

  // Two separate memos on purpose: the guest repository must not depend on the Supabase client.
  // Otherwise the SDK finishing its background load would rebuild the guest repository, reload the
  // library and remount the page under the reader's cursor.
  const guestRepository = useMemo(() => (status === 'guest' ? new GuestRepository() : null), [status]);
  const accountRepository = useMemo<LibraryRepository | null>(
    () => (status === 'account' && client && user ? new SupabaseRepository(client, user.id) : null),
    // user.id rather than user: token refreshes shouldn't rebuild the repository.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, client, user?.id],
  );
  const repository = accountRepository ?? guestRepository;

  const startGuest = useCallback(() => {
    writeGuestFlag(true);
    setGuest(true);
  }, []);

  const endGuest = useCallback(() => {
    writeGuestFlag(false);
    GuestRepository.clear();
    setGuest(false);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user,
      repository,
      authAvailable: isSupabaseConfigured,
      startGuest,
      endGuest,
      async signIn(email, password) {
        const { error } = await (await auth()).signInWithPassword({ email, password });
        if (error) throw error;
        writeGuestFlag(false);
        setGuest(false);
      },
      async signUp(email, password) {
        const { data, error } = await (await auth()).signUp({
          email,
          password,
          options: { emailRedirectTo: appUrl('library') },
        });
        if (error) throw error;
        if (data.session) {
          writeGuestFlag(false);
          setGuest(false);
        }
        return { needsConfirmation: !data.session };
      },
      async signOut() {
        await (await auth()).signOut();
      },
      async requestPasswordReset(email) {
        const { error } = await (await auth()).resetPasswordForEmail(email, {
          redirectTo: appUrl('reset-password'),
        });
        if (error) throw error;
      },
      async updatePassword(password) {
        const { error } = await (await auth()).updateUser({ password });
        if (error) throw error;
      },
    }),
    [status, user, repository, startGuest, endGuest],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
