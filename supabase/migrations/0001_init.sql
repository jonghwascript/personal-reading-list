-- Bookshelf schema. Run in the Supabase SQL editor (or `supabase db push`).
--
-- Design notes
-- * `books` is a shared, normalized catalog keyed by catalog_key (work key → ISBN-13 → title|surname)
--   so two users adding Dune reference one row, and API corrections can be applied in one place.
-- * Everything personal hangs off `library_entries` (one row per user per book; a book sits on
--   exactly one shelf, enforced by the single shelf_id column).
-- * `reading_logs` keeps progress history; a single current_page column can't answer
--   "pages read per week".
-- * Ids are generated client-side for optimistic UI, hence no defaults on most primary keys.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
create table public.books (
  id uuid primary key default gen_random_uuid(),
  catalog_key text not null unique,
  title text not null,
  authors text[] not null default '{}',
  cover_url text,
  isbn10 text,
  isbn13 text,
  page_count int check (page_count is null or page_count > 0),
  published_year int,
  publisher text,
  description text,
  genres text[] not null default '{}',
  source text not null default 'openlibrary' check (source in ('openlibrary', 'seed', 'import')),
  work_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index books_isbn13_idx on public.books (isbn13) where isbn13 is not null;

-- ---------------------------------------------------------------------------
-- Per-user data
-- ---------------------------------------------------------------------------
create table public.shelves (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  position int not null default 0,
  kind text check (kind in ('want', 'reading', 'read')),
  created_at timestamptz not null default now(),
  unique (user_id, kind)
);
create index shelves_user_idx on public.shelves (user_id, position);

create table public.library_entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id),
  -- restrict: the app moves books to "Want to Read" before deleting a shelf.
  shelf_id uuid not null references public.shelves (id) on delete restrict,
  added_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  rating smallint check (rating between 1 and 5),
  notes text not null default '',
  -- Personal genre tags; start as a copy of the catalog's genres.
  genres text[] not null default '{}',
  current_page int check (current_page is null or current_page >= 0),
  progress_percent numeric(5, 2) check (progress_percent between 0 and 100),
  progress_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, book_id)
);
create index entries_user_shelf_idx on public.library_entries (user_id, shelf_id);
create index entries_user_finished_idx on public.library_entries (user_id, finished_at) where finished_at is not null;
create index entries_genres_idx on public.library_entries using gin (genres);

create table public.reading_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_id uuid not null references public.library_entries (id) on delete cascade,
  page int,
  percent numeric(5, 2) not null,
  logged_at timestamptz not null default now()
);
create index reading_logs_user_time_idx on public.reading_logs (user_id, logged_at);

create table public.reading_goals (
  user_id uuid not null references auth.users (id) on delete cascade,
  year int not null,
  target int not null check (target between 1 and 1000),
  primary key (user_id, year)
);

create table public.preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  default_shelf_id uuid references public.shelves (id) on delete set null,
  display jsonb not null default '{}'
);

-- ---------------------------------------------------------------------------
-- Timestamps
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger books_touch before update on public.books
  for each row execute function public.touch_updated_at();
create trigger entries_touch before update on public.library_entries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- New users get the three default shelves and a preferences row
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.shelves (id, user_id, name, position, kind) values
    (gen_random_uuid(), new.id, 'Currently Reading', 0, 'reading'),
    (gen_random_uuid(), new.id, 'Want to Read', 1, 'want'),
    (gen_random_uuid(), new.id, 'Read', 2, 'read');
  insert into public.preferences (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Default shelves can be renamed but never deleted.
create or replace function public.protect_default_shelves() returns trigger language plpgsql as $$
begin
  if old.kind is not null then
    raise exception 'Default shelves cannot be deleted';
  end if;
  return old;
end $$;

create trigger shelves_protect_defaults before delete on public.shelves
  for each row execute function public.protect_default_shelves();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.books enable row level security;
alter table public.shelves enable row level security;
alter table public.library_entries enable row level security;
alter table public.reading_logs enable row level security;
alter table public.reading_goals enable row level security;
alter table public.preferences enable row level security;

-- Catalog: any signed-in user can read and contribute; rows are never deleted by clients.
create policy "books readable" on public.books for select to authenticated using (true);
create policy "books insertable" on public.books for insert to authenticated with check (true);
create policy "books updatable" on public.books for update to authenticated using (true) with check (true);

create policy "own shelves" on public.shelves for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own entries" on public.library_entries for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.shelves s where s.id = shelf_id and s.user_id = auth.uid())
  );

create policy "own logs" on public.reading_logs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own goals" on public.reading_goals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own preferences" on public.preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
