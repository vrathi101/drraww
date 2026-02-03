alter table public.notes
  add column if not exists last_opened_at timestamptz;

create index if not exists notes_last_opened_idx on public.notes (last_opened_at desc);
