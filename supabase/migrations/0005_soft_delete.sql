alter table public.notes
  add column if not exists deleted_at timestamptz,
  add column if not exists archived_at timestamptz;

create index if not exists notes_deleted_idx on public.notes (deleted_at);
create index if not exists notes_archived_idx on public.notes (archived_at);
