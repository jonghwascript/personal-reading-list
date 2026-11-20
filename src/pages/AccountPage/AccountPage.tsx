import { LogOut, RotateCcw, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ThemeSwitcher } from '../../components/ThemeSwitcher/ThemeSwitcher';
import { Button, ButtonLink } from '../../components/ui/Button';
import { GuestRepository } from '../../data/guestRepository';
import { usePageTitle } from '../../lib/usePageTitle';
import { useAnnouncer } from '../../state/AnnouncerContext';
import { useLibrary } from '../../state/LibraryContext';
import { useSession } from '../../state/SessionContext';
import page from '../Page.module.css';
import styles from './AccountPage.module.css';

/** Mobile-reachable home for account actions (desktop shows them in the sidebar). */
export function AccountPage() {
  usePageTitle('Account');
  const { status, user, signOut, endGuest, repository } = useSession();
  const { reload } = useLibrary();
  const { notify } = useAnnouncer();
  const navigate = useNavigate();

  return (
    <div className={page.page}>
      <header>
        <p className={page.eyebrow}>{status === 'guest' ? 'Guest mode' : 'Account'}</p>
        <h1 className={page.title}>{status === 'guest' ? 'You’re browsing as a guest' : 'Your account'}</h1>
      </header>

      {status === 'guest' ? (
        <div className={styles.card}>
          <p>
            Everything you do here is real — but it only lasts until you close this tab. Create an account to keep your
            own library, synced across devices.
          </p>
          <div className={styles.actions}>
            <ButtonLink to="/signup" variant="primary" icon={<UserRound />}>
              Create your account
            </ButtonLink>
            <ButtonLink to="/signin" variant="secondary">
              Sign in
            </ButtonLink>
          </div>
          <div className={styles.actions}>
            <Button
              variant="ghost"
              icon={<RotateCcw />}
              onClick={async () => {
                if (repository instanceof GuestRepository) repository.reset();
                await reload();
                notify('The sample library has been restored.', 'success');
              }}
            >
              Reset sample library
            </Button>
            <Button
              variant="ghost"
              icon={<LogOut />}
              onClick={() => {
                endGuest();
                navigate('/');
              }}
            >
              Leave guest mode
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.card}>
          <dl className={styles.facts}>
            <div>
              <dt>Signed in as</dt>
              <dd>{user?.email}</dd>
            </div>
          </dl>
          <div className={styles.actions}>
            <ButtonLink to="/forgot-password" variant="secondary">
              Change password
            </ButtonLink>
            <Button
              variant="ghost"
              icon={<LogOut />}
              onClick={async () => {
                await signOut();
                navigate('/');
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      )}

      <section className={styles.card} aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className={styles.cardTitle}>
          Appearance
        </h2>
        <ThemeSwitcher />
        <p className={styles.note}>“System” follows your device’s light or dark setting. Your choice is remembered on this device.</p>
      </section>
    </div>
  );
}
