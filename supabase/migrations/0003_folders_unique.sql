-- Enforce unique folder names per user (case-insensitive)
create unique index if not exists folders_owner_name_key
on public.folders (owner_id, lower(name));
