begin;

create table if not exists public.note_attachments (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  mime_type text,
  file_name text,
  size bigint,
  created_at timestamptz not null default now()
);

alter table public.note_attachments enable row level security;

create index if not exists note_attachments_note_idx on public.note_attachments(note_id);
create index if not exists note_attachments_owner_idx on public.note_attachments(owner_id);

create policy "owners can read attachments" on public.note_attachments
  for select using (auth.uid() = owner_id);
create policy "owners can insert attachments" on public.note_attachments
  for insert with check (auth.uid() = owner_id);
create policy "owners can delete attachments" on public.note_attachments
  for delete using (auth.uid() = owner_id);

commit;
