-- Folders table
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Updated_at trigger for folders
drop trigger if exists folders_update_timestamp on public.folders;
create trigger folders_update_timestamp
before update on public.folders
for each row execute procedure public.update_timestamp();

-- Add folder_id to notes
alter table public.notes
  add column if not exists folder_id uuid references public.folders (id);

create index if not exists notes_folder_idx on public.notes (folder_id);

-- RLS for folders
alter table public.folders enable row level security;

create policy "Folders readable by owner" on public.folders
  for select using (owner_id = auth.uid());

create policy "Folders insertable by owner" on public.folders
  for insert with check (owner_id = auth.uid());

create policy "Folders updatable by owner" on public.folders
  for update using (owner_id = auth.uid());

create policy "Folders deletable by owner" on public.folders
  for delete using (owner_id = auth.uid());
