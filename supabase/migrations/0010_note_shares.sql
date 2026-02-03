begin;

create table if not exists public.note_shares (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  allow_edit boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

alter table public.note_shares enable row level security;

create index if not exists note_shares_note_id_idx on public.note_shares(note_id);
create index if not exists note_shares_owner_idx on public.note_shares(owner_id);
create index if not exists note_shares_token_idx on public.note_shares(token);

create policy "Owners manage share links" on public.note_shares
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

commit;
