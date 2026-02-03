alter table public.notes
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pinned_at timestamptz;

create index if not exists notes_pinned_idx on public.notes (is_pinned, pinned_at desc);
