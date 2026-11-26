-- Closer · copie de secours hebdomadaire des éléments (audit n° 4, piste 3).
-- L'offre gratuite de Supabase n'a pas de sauvegarde automatique : chaque lundi à 3 h, une copie complète
-- de closer_items est rangée dans closer_items_archive, et seules les 4 dernières copies sont gardées.
-- La table d'archive n'a aucune règle d'accès : l'appli ne peut ni la lire ni l'écrire, seul le SQL Editor y accède.
-- À exécuter une fois dans Supabase › SQL Editor.

create table if not exists public.closer_items_archive (
  archived_on date not null,
  user_id uuid not null,
  id text not null,
  data jsonb,
  deleted boolean not null,
  updated_at bigint not null,
  primary key (archived_on, user_id, id)
);
alter table public.closer_items_archive enable row level security;
revoke all on public.closer_items_archive from anon, authenticated;

create or replace function public.closer_archive() returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.closer_items_archive where archived_on = current_date;
  insert into public.closer_items_archive (archived_on, user_id, id, data, deleted, updated_at)
    select current_date, user_id, id, data, deleted, updated_at from public.closer_items;
  -- garder les 4 dernières copies
  delete from public.closer_items_archive a
    where a.archived_on not in (select distinct archived_on from public.closer_items_archive order by archived_on desc limit 4);
end $$;
revoke execute on function public.closer_archive() from public, anon, authenticated;

select cron.unschedule('closer-archive') where exists (select 1 from cron.job where jobname = 'closer-archive');
select cron.schedule('closer-archive', '0 3 * * 1', $$select public.closer_archive()$$);

-- Première copie tout de suite :
select public.closer_archive();

-- ===== Vérifier =====
-- select archived_on, count(*) as lignes, count(distinct user_id) as comptes from public.closer_items_archive group by 1 order by 1 desc;

-- ===== Remettre les éléments d'un compte depuis une copie (en cas de besoin, à adapter) =====
-- insert into public.closer_items (user_id, id, data, deleted)
--   select user_id, id, data, deleted from public.closer_items_archive
--   where archived_on = 'AAAA-MM-JJ' and user_id = '<uuid du compte>'
-- on conflict (user_id, id) do update set data = excluded.data, deleted = excluded.deleted;
