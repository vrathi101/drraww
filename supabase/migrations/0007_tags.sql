-- Tags table
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- updated_at trigger
drop trigger if exists tags_update_timestamp on public.tags;
create trigger tags_update_timestamp
before update on public.tags
for each row execute procedure public.update_timestamp();

create unique index if not exists tags_owner_name_key
  on public.tags (owner_id, lower(name));

-- Note tags pivot
create table if not exists public.note_tags (
  note_id uuid references public.notes (id) on delete cascade,
  tag_id uuid references public.tags (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (note_id, tag_id)
);

-- RLS
alter table public.tags enable row level security;
alter table public.note_tags enable row level security;

create policy "Tags readable by owner" on public.tags
  for select using (owner_id = auth.uid());
create policy "Tags insertable by owner" on public.tags
  for insert with check (owner_id = auth.uid());
create policy "Tags updatable by owner" on public.tags
  for update using (owner_id = auth.uid());
create policy "Tags deletable by owner" on public.tags
  for delete using (owner_id = auth.uid());

create policy "Note tags readable by owner" on public.note_tags
  for select using (
    exists (select 1 from public.notes n where n.id = note_id and n.owner_id = auth.uid())
  );
create policy "Note tags insertable by owner" on public.note_tags
  for insert with check (
    exists (select 1 from public.notes n where n.id = note_id and n.owner_id = auth.uid()) and
    exists (select 1 from public.tags t where t.id = tag_id and t.owner_id = auth.uid())
  );
create policy "Note tags deletable by owner" on public.note_tags
  for delete using (
    exists (select 1 from public.notes n where n.id = note_id and n.owner_id = auth.uid())
  );
