alter table public.folders
  add column if not exists parent_id uuid,
  add constraint folders_parent_fk foreign key (parent_id) references public.folders(id) on delete set null;

-- prevent duplicate names in same parent (case-insensitive)
create unique index if not exists folders_owner_parent_name_key
  on public.folders (owner_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'), lower(name));

create index if not exists folders_parent_idx on public.folders(parent_id);
