create function public.save_reading_progress(
  entry_id uuid, expected_at timestamptz, next_entry jsonb, log_change jsonb, undo boolean
) returns boolean language plpgsql set search_path = '' as $$
begin
  update public.library_entries e set
    started_at = (next_entry->>'started_at')::timestamptz,
    current_page = (next_entry->>'current_page')::integer,
    current_minutes = (next_entry->>'current_minutes')::integer,
    progress_percent = (next_entry->>'progress_percent')::numeric,
    progress_updated_at = (next_entry->>'progress_updated_at')::timestamptz
  where e.id = save_reading_progress.entry_id and e.user_id = auth.uid()
    and e.progress_updated_at is not distinct from expected_at;
  if not found then return false; end if;

  if undo then
    delete from public.reading_logs l
    where l.id = (log_change->>'id')::uuid and l.entry_id = save_reading_progress.entry_id;
  else
    insert into public.reading_logs (id, user_id, entry_id, page, percent, minutes, logged_at)
    values ((log_change->>'id')::uuid, auth.uid(), entry_id, (log_change->>'page')::integer,
      (log_change->>'percent')::numeric, (log_change->>'minutes')::integer, (log_change->>'loggedAt')::timestamptz);
  end if;
  return true;
end;
$$;

create function public.move_books_and_delete_shelf(source_id uuid, target_id uuid, moved_at timestamptz)
returns void language plpgsql set search_path = '' as $$
declare
  target_kind text;
begin
  perform 1 from public.shelves s
  where s.user_id = auth.uid() and s.id in (source_id, target_id)
  order by s.id for update;
  if source_id = target_id
    or not exists (select from public.shelves s where s.id = source_id and s.user_id = auth.uid() and s.kind is null)
    or not exists (select from public.shelves s where s.id = target_id and s.user_id = auth.uid()) then
    raise exception 'Shelf is unavailable';
  end if;

  select s.kind into target_kind from public.shelves s where s.id = target_id;
  update public.library_entries e set
    shelf_id = target_id,
    started_at = case when target_kind in ('read', 'reading') then coalesce(e.started_at, moved_at) else e.started_at end,
    finished_at = case
      when target_kind = 'read' then coalesce(e.finished_at, case when e.progress_percent = 100 then e.progress_updated_at end, moved_at)
      when target_kind = 'reading' then null
      else e.finished_at
    end,
    current_page = case
      when target_kind = 'read' and e.progress_percent is distinct from 100 and e.format = 'print'
        then coalesce(e.total_pages, (select b.page_count from public.books b where b.id = e.book_id), e.current_page)
      when target_kind = 'reading' and (e.progress_updated_at is null or e.progress_percent = 100)
        then case when e.format = 'print' then 0 end
      else e.current_page
    end,
    current_minutes = case
      when target_kind = 'read' and e.progress_percent is distinct from 100 and e.format = 'audio'
        then coalesce(e.total_minutes, e.current_minutes)
      when target_kind = 'reading' and (e.progress_updated_at is null or e.progress_percent = 100)
        then case when e.format = 'audio' then 0 end
      else e.current_minutes
    end,
    progress_percent = case
      when target_kind = 'read' then 100
      when target_kind = 'reading' and (e.progress_updated_at is null or e.progress_percent = 100) then case
        when e.format = 'ebook' or (e.format = 'audio' and e.total_minutes is not null)
          or (e.format = 'print' and coalesce(e.total_pages, (select b.page_count from public.books b where b.id = e.book_id)) is not null) then 0
      end
      else e.progress_percent
    end,
    progress_updated_at = case
      when target_kind = 'read' and e.progress_percent is distinct from 100 then moved_at
      when target_kind = 'reading' and (e.progress_updated_at is null or e.progress_percent = 100) then moved_at
      else e.progress_updated_at
    end
  where e.shelf_id = source_id and e.user_id = auth.uid();
  delete from public.shelves where id = source_id and user_id = auth.uid();
end;
$$;

revoke execute on function public.save_reading_progress(uuid, timestamptz, jsonb, jsonb, boolean) from public;
revoke execute on function public.move_books_and_delete_shelf(uuid, uuid, timestamptz) from public;
grant execute on function public.save_reading_progress(uuid, timestamptz, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.move_books_and_delete_shelf(uuid, uuid, timestamptz) to authenticated;
