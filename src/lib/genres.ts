/**
 * Open Library subjects mix genres with noise ("Accessible book", "Protected DAISY", place names).
 * We map them onto a small canonical vocabulary so filters and genre charts stay meaningful.
 */
const GENRE_RULES: [RegExp, string][] = [
  [/science fiction|sci-fi|space opera|cyberpunk/i, 'Sci-Fi'],
  [/fantasy|magic|dragons/i, 'Fantasy'],
  [/dystopia/i, 'Dystopian'],
  [/mystery|detective|crime/i, 'Mystery'],
  [/thriller|suspense/i, 'Thriller'],
  [/horror/i, 'Horror'],
  [/romance|love stories/i, 'Romance'],
  [/historical fiction/i, 'Historical Fiction'],
  [/classic/i, 'Classics'],
  [/biography|autobiography|memoir/i, 'Memoir'],
  [/history/i, 'History'],
  [/psychology/i, 'Psychology'],
  [/self-help|self-improvement|personal development|success|habits/i, 'Self-Improvement'],
  [/productivity|time management/i, 'Productivity'],
  [/philosophy|stoic/i, 'Philosophy'],
  [/business|economics|finance|money/i, 'Business'],
  [/science|biology|physics|anatomy/i, 'Science'],
  [/programming|software|computer|javascript|coding/i, 'Programming'],
  [/design|usability|user interface/i, 'Design'],
  [/poetry/i, 'Poetry'],
  [/young adult|juvenile fiction/i, 'Young Adult'],
  [/^fiction$|novel|literary fiction|fiction, general/i, 'Fiction'],
  [/non-?fiction/i, 'Non-Fiction'],
];

export function normalizeGenres(subjects: string[], max = 3): string[] {
  const found: string[] = [];
  for (const subject of subjects) {
    for (const [pattern, genre] of GENRE_RULES) {
      if (pattern.test(subject) && !found.includes(genre)) {
        found.push(genre);
        break;
      }
    }
    if (found.length >= max) break;
  }
  return found;
}
