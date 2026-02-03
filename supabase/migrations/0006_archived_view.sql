drop view if exists public.archived_notes;

create view public.archived_notes as
select *
from public.notes
where archived_at is not null and is_deleted = false;
