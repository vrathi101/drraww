begin;

alter table public.note_shares
  add column if not exists password_hash text;

commit;
