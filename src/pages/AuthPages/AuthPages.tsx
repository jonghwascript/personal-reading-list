import { CircleAlert, MailCheck } from 'lucide-react';
import { useId, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { usePageTitle } from '../../lib/usePageTitle';
import { useAnnouncer } from '../../state/AnnouncerContext';
import { useSession } from '../../state/SessionContext';
import { AuthLayout } from './AuthLayout';
import styles from './AuthPages.module.css';

const MIN_PASSWORD = 8;

/** Turns Supabase's terse messages into guidance a person can act on. */
function friendlyAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match an account. Check for typos, or reset your password.';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email first — check your inbox for the link we sent.';
  if (/already registered|already exists/i.test(message)) return 'An account with this email already exists. Try signing in instead.';
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Please wait a minute and try again.';
  if (/password/i.test(message) && /characters|short|weak/i.test(message)) return `Choose a stronger password (at least ${MIN_PASSWORD} characters).`;
  if (/failed to fetch|network/i.test(message)) return 'We couldn’t reach the server. Check your connection and try again.';
  return message;
}

function Field({ label, hint, error, ...input }: { label: string; hint?: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input id={id} className={styles.input} aria-describedby={describedBy} aria-invalid={error ? true : undefined} {...input} />
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className={styles.formError} role="alert">
      <CircleAlert size={18} aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

function AuthUnavailable() {
  const { startGuest } = useSession();
  const navigate = useNavigate();
  return (
    <div className={styles.notice}>
      <p>Accounts aren’t configured on this deployment yet, but the full app is available as a guest.</p>
      <Button
        variant="primary"
        onClick={() => {
          startGuest();
          navigate('/library');
        }}
      >
        Explore as a guest
      </Button>
    </div>
  );
}

export function SignInPage() {
  usePageTitle('Sign in');
  const { signIn, status, authAvailable } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/library';
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'account') return <Navigate to={from} replace />;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await signIn(String(data.get('email')), String(data.get('password')));
      navigate(from, { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      lede="Sign in to pick up where you left off."
      footer={
        <p>
          New to Bookshelf? <Link to="/signup">Create an account</Link>
        </p>
      }
    >
      {!authAvailable ? (
        <AuthUnavailable />
      ) : (
        <form className={styles.form} onSubmit={submit} noValidate={false}>
          <FormError message={error} />
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <Field label="Password" name="password" type="password" autoComplete="current-password" required />
          <Link to="/forgot-password" className={styles.inlineLink}>
            Forgot your password?
          </Link>
          <Button type="submit" variant="primary" size="lg" disabled={busy} aria-busy={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function SignUpPage() {
  usePageTitle('Create account');
  const { signUp, status, authAvailable } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (status === 'account') return <Navigate to="/library" replace />;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get('email'));
    const password = String(data.get('password'));
    if (password.length < MIN_PASSWORD) {
      setPasswordError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setPasswordError(undefined);
    setBusy(true);
    setError(null);
    try {
      const { needsConfirmation } = await signUp(email, password);
      if (needsConfirmation) setSentTo(email);
      else navigate('/library', { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <AuthLayout title="Check your inbox">
        <div className={styles.notice} role="status">
          <MailCheck size={28} aria-hidden="true" className={styles.noticeIcon} />
          <p>
            We sent a confirmation link to <strong>{sentTo}</strong>. Open it to finish creating your account — your
            three default shelves will be waiting.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Start your library"
      lede="Free, private, and yours. Save books, shelves, notes and reading goals across devices."
      footer={
        <p>
          Already have an account? <Link to="/signin">Sign in</Link>
        </p>
      }
    >
      {status === 'guest' && (
        <p className={styles.guestNote}>
          Heads up: the sample guest library isn’t copied into new accounts — you’ll start with empty shelves of your own.
        </p>
      )}
      {!authAvailable ? (
        <AuthUnavailable />
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <FormError message={error} />
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
            hint={`At least ${MIN_PASSWORD} characters.`}
            error={passwordError}
          />
          <Button type="submit" variant="primary" size="lg" disabled={busy} aria-busy={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  usePageTitle('Reset password');
  const { requestPasswordReset, authAvailable } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(String(new FormData(e.currentTarget).get('email')));
      setSent(true);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      lede={sent ? undefined : 'Enter your email and we’ll send you a link to choose a new password.'}
      footer={
        <p>
          Remembered it? <Link to="/signin">Back to sign in</Link>
        </p>
      }
    >
      {!authAvailable ? (
        <AuthUnavailable />
      ) : sent ? (
        <div className={styles.notice} role="status">
          <MailCheck size={28} aria-hidden="true" className={styles.noticeIcon} />
          <p>If an account exists for that email, a reset link is on its way. It may take a minute to arrive.</p>
        </div>
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <FormError message={error} />
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <Button type="submit" variant="primary" size="lg" disabled={busy} aria-busy={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

/** Landing page for the email link; Supabase restores a recovery session from the URL. */
export function ResetPasswordPage() {
  usePageTitle('Choose a new password');
  const { updatePassword, status } = useSession();
  const { notify } = useAnnouncer();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const password = String(data.get('password'));
    if (password.length < MIN_PASSWORD) return setFieldError(`Use at least ${MIN_PASSWORD} characters.`);
    if (password !== String(data.get('confirm'))) return setFieldError('The two passwords don’t match.');
    setFieldError(undefined);
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      notify('Password updated. You’re signed in.', 'success');
      navigate('/library', { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Choose a new password">
      {status === 'loading' ? (
        <p role="status">Checking your reset link…</p>
      ) : status !== 'account' ? (
        <div className={styles.notice}>
          <p>This reset link has expired or was already used.</p>
          <Link to="/forgot-password">Request a new link</Link>
        </div>
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <FormError message={error} />
          <Field label="New password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} hint={`At least ${MIN_PASSWORD} characters.`} />
          <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required error={fieldError} />
          <Button type="submit" variant="primary" size="lg" disabled={busy} aria-busy={busy}>
            {busy ? 'Saving…' : 'Save new password'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
