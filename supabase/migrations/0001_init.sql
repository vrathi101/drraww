-- Core extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Notes table
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Untitled',
  doc jsonb not null default '{}'::jsonb,
  thumbnail_path text,
  is_deleted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Note revisions (append-only history)
create table if not exists public.note_revisions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  doc jsonb not null,
  reason text,
  created_at timestamptz not null default timezone('utc', now())
);

-- updated_at trigger
create or replace function public.update_timestamp() returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists notes_update_timestamp on public.notes;
create trigger notes_update_timestamp
before update on public.notes
for each row execute procedure public.update_timestamp();

-- Helpful indexes
create index if not exists notes_owner_updated_idx on public.notes (owner_id, updated_at desc);
create index if not exists notes_is_deleted_idx on public.notes (is_deleted);

-- Row Level Security
alter table public.notes enable row level security;
alter table public.note_revisions enable row level security;

create policy "Notes are readable by owner" on public.notes
  for select using (owner_id = auth.uid());

create policy "Notes are insertable by owner" on public.notes
  for insert with check (owner_id = auth.uid());

create policy "Notes are updatable by owner" on public.notes
  for update using (owner_id = auth.uid());

create policy "Notes are deletable by owner" on public.notes
  for delete using (owner_id = auth.uid());

create policy "Revisions readable by owner" on public.note_revisions
  for select using (owner_id = auth.uid());

create policy "Revisions insertable by owner" on public.note_revisions
  for insert with check (owner_id = auth.uid());

-- Storage bucket for thumbnails/exports/assets
insert into storage.buckets (id, name, public)
values ('note-assets', 'note-assets', false)
on conflict (id) do nothing;

create policy "Allow authenticated uploads to own prefix" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'note-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Allow authenticated access to own assets" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'note-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Allow authenticated updates to own assets" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'note-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'note-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Allow authenticated delete of own assets" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'note-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
