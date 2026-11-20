-- Reading formats and position-only progress.
--
-- * format: print (pages), ebook (percent), audio (minutes). Each has its own natural position.
-- * total_pages: the user's own edition length. Editions of one work differ (Circe: 336 vs 696
--   pages), so a per-copy override keeps percentages honest.
-- * Progress may now be a position without a percent ("page 147 of ?"), so percent is nullable in
--   the history table too.
-- Safe to run once on top of 0001 + 0002.

alter table public.library_entries
  add column if not exists format text not null default 'print' check (format in ('print', 'ebook', 'audio')),
  add column if not exists total_pages int check (total_pages is null or total_pages > 0),
  add column if not exists total_minutes int check (total_minutes is null or total_minutes > 0),
  add column if not exists current_minutes int check (current_minutes is null or current_minutes >= 0);

alter table public.reading_logs
  add column if not exists minutes int check (minutes is null or minutes >= 0),
  alter column percent drop not null;
