-- Explicit table privileges. Newer Supabase projects don't always auto-grant table access to the
-- API roles, which surfaces as "permission denied for table ..." (42501) even with RLS policies in
-- place. RLS still decides *which rows* a user sees; these grants decide whether the role may touch
-- the table at all. Safe to run more than once.

grant usage on schema public to authenticated;

-- Shared catalog: read/add/refresh, never delete from the client.
grant select, insert, update on public.books to authenticated;

grant select, insert, update, delete on
  public.shelves,
  public.library_entries,
  public.reading_logs,
  public.reading_goals,
  public.preferences
to authenticated;

-- Signed-out visitors (guest mode runs entirely in the browser) need no table access.
revoke all on
  public.books,
  public.shelves,
  public.library_entries,
  public.reading_logs,
  public.reading_goals,
  public.preferences
from anon;
