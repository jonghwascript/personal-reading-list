import { ArrowDown, ArrowUp, BookMarked, Lock, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { pluralize } from '../../lib/format';
import { usePageTitle } from '../../lib/usePageTitle';
import { useAnnouncer } from '../../state/AnnouncerContext';
import { useLibrary } from '../../state/LibraryContext';
import page from '../Page.module.css';
import styles from './ShelvesPage.module.css';

/**
 * Shelf management. Reordering uses explicit move buttons — fully keyboard and screen reader
 * operable. (Drag-and-drop arrives with the animated-shelf differentiator as an enhancement.)
 */
export function ShelvesPage() {
  usePageTitle('Shelves');
  const { shelves, entries, reorderShelves, createShelf } = useLibrary();
  const { announce } = useAnnouncer();
  const [name, setName] = useState('');

  const move = async (index: number, delta: -1 | 1) => {
    const ids = shelves.map((s) => s.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    await reorderShelves(ids);
    const shelf = shelves[index]!;
    announce(`${shelf.name} moved to position ${target + 1} of ${ids.length}.`);
    // Keep focus on the same control of the moved shelf so repeated presses keep working.
    requestAnimationFrame(() => {
      const btn = document.querySelector<HTMLButtonElement>(`[data-move="${shelf.id}:${delta}"]`);
      (btn && !btn.disabled ? btn : document.querySelector<HTMLButtonElement>(`[data-move="${shelf.id}:${-delta}"]`))?.focus();
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const shelf = await createShelf(name);
    announce(`Shelf “${shelf.name}” created.`);
    setName('');
  };

  return (
    <div className={page.page}>
      <header>
        <p className={page.eyebrow}>Organize</p>
        <h1 className={page.title}>Your shelves</h1>
        <p className={page.lede}>Each book lives on one shelf. Reorder shelves to change how they appear everywhere.</p>
      </header>

      <ol className={styles.list}>
        {shelves.map((shelf, i) => {
          const count = entries.filter((e) => e.shelfId === shelf.id).length;
          return (
            <li key={shelf.id} className={styles.item}>
              <span className={styles.position} aria-hidden="true">
                {i + 1}
              </span>
              <BookMarked size={20} aria-hidden="true" className={styles.icon} />
              <div className={styles.info}>
                <Link to={`/shelves/${shelf.id}`} className={styles.name}>
                  {shelf.name}
                </Link>
                <span className={styles.meta}>
                  {pluralize(count, 'book')}
                  {shelf.kind && (
                    <>
                      {' · '}
                      <Lock size={12} aria-hidden="true" /> default shelf
                    </>
                  )}
                </span>
              </div>
              <div className={styles.moves}>
                <Button
                  iconOnly
                  size="sm"
                  variant="ghost"
                  icon={<ArrowUp />}
                  disabled={i === 0}
                  data-move={`${shelf.id}:-1`}
                  onClick={() => move(i, -1)}
                >
                  Move {shelf.name} up
                </Button>
                <Button
                  iconOnly
                  size="sm"
                  variant="ghost"
                  icon={<ArrowDown />}
                  disabled={i === shelves.length - 1}
                  data-move={`${shelf.id}:1`}
                  onClick={() => move(i, 1)}
                >
                  Move {shelf.name} down
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      <form className={styles.create} onSubmit={submit}>
        <label htmlFor="create-shelf" className={page.field}>
          New shelf
        </label>
        <div className={styles.createRow}>
          <input
            id="create-shelf"
            className={page.input}
            value={name}
            maxLength={60}
            placeholder="e.g. Favorites, Book Club 2026, Lent Out"
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="primary" icon={<Plus />} disabled={!name.trim()}>
            Create shelf
          </Button>
        </div>
      </form>
    </div>
  );
}
