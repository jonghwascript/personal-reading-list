import { FileUp, LogOut, RotateCcw, UserRound } from 'lucide-react';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ReadingSettings } from '../../components/ReadingSettings/ReadingSettings';
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
  const location = useLocation();

  useEffect(() => {
    if (location.hash === '#appearance') document.getElementById('appearance')?.scrollIntoView({ block: 'start' });
  }, [location.hash]);

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

      <section className={styles.card} aria-labelledby="import-heading">
        <h2 id="import-heading" className={styles.cardTitle}>
          Import
        </h2>
        <p>Coming from Goodreads? Bring your shelves, ratings and read dates with you.</p>
        <div className={styles.actions}>
          <ButtonLink to="/import" variant="secondary" icon={<FileUp />}>
            Import from Goodreads
          </ButtonLink>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="appearance-heading" id="appearance">
        <h2 id="appearance-heading" className={styles.cardTitle}>
          Appearance &amp; reading
        </h2>
        <ReadingSettings />
      </section>
    </div>
  );
}
