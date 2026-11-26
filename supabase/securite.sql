-- Closer · renforcement de la sécurité (26 nov. 2026). À exécuter une fois dans Supabase › SQL Editor, APRÈS les autres
-- scripts (closer.sql, notifications.sql, photos.sql, erreurs.sql). Relançable sans risque.
-- Ordre de mise en place : 1) ce script ; 2) redéployer la fonction closer-push (elle exige alors la clé du cron).
-- Rien de ce qui existe n'est effacé : on ajoute des limites et une clé.

-- 1. Fonction des notifications : seul pg_cron peut lancer les envois, avec une clé secrète partagée.
--    La clé est rangée dans closer_push_config (aucune règle de lecture : invisible depuis les téléphones).
alter table public.closer_push_config add column if not exists cron_key text;
update public.closer_push_config
   set cron_key = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
 where id = 1 and (cron_key is null or length(cron_key) < 64);
select cron.unschedule(jobid) from cron.job where jobname = 'closer-push';
select cron.schedule(
  'closer-push',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://jnhykrfvoqyjbajmcwny.supabase.co/functions/v1/closer-push',
       headers := jsonb_build_object('Content-Type', 'application/json',
                                     'x-closer-cron', (select cron_key from public.closer_push_config where id = 1)),
       body := '{}'::jsonb,
       timeout_milliseconds := 20000
     ) $$
);

-- 2. Tailles maximales : personne ne peut remplir la base avec des lignes énormes.
--    « not valid » : la règle vaut pour toute écriture à venir, sans relire l'existant.
alter table public.closer_items drop constraint if exists closer_items_taille;
alter table public.closer_items add constraint closer_items_taille
  check (length(id) <= 64 and (data is null or pg_column_size(data) <= 300000)) not valid;
alter table public.closer_push drop constraint if exists closer_push_taille;
alter table public.closer_push add constraint closer_push_taille
  check (length(endpoint) <= 1000 and length(p256dh) <= 200 and length(auth) <= 200 and length(tz) <= 64
         and (morning is null or length(morning) <= 5) and (evening is null or length(evening) <= 5)) not valid;
alter table public.closer_events drop constraint if exists closer_events_taille;
alter table public.closer_events add constraint closer_events_taille check (v is null or length(v) <= 24) not valid;

-- 3. Au plus 20 000 éléments par compte (bien au-delà d'un usage normal).
create or replace function public.closer_items_plafond() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.closer_items where user_id = new.user_id) >= 20000 then
    raise exception 'Closer : nombre maximal d''éléments atteint pour ce compte' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists closer_items_plafond on public.closer_items;
create trigger closer_items_plafond before insert on public.closer_items
  for each row execute function public.closer_items_plafond();

-- 4. Statistiques et erreurs anonymes : débit limité (au plus 30 par appareil et par heure, 3 000 par heure en tout).
--    Au-delà, la ligne est simplement ignorée (l'appli ne voit aucune erreur).
create index if not exists closer_events_debit on public.closer_events (aid, created_at);
create index if not exists closer_errors_debit on public.closer_errors (aid, created_at);
create or replace function public.closer_anonyme_debit() returns trigger language plpgsql security definer set search_path = '' as $$
declare n_app int; n_tout int;
begin
  if tg_table_name = 'closer_events' then
    select count(*) into n_app from public.closer_events where aid = new.aid and created_at > now() - interval '1 hour';
    select count(*) into n_tout from public.closer_events where created_at > now() - interval '1 hour';
  else
    select count(*) into n_app from public.closer_errors where aid = new.aid and created_at > now() - interval '1 hour';
    select count(*) into n_tout from public.closer_errors where created_at > now() - interval '1 hour';
  end if;
  if n_app >= 30 or n_tout >= 3000 then return null; end if;
  return new;
end $$;
drop trigger if exists closer_events_debit on public.closer_events;
create trigger closer_events_debit before insert on public.closer_events for each row execute function public.closer_anonyme_debit();
drop trigger if exists closer_errors_debit on public.closer_errors;
create trigger closer_errors_debit before insert on public.closer_errors for each row execute function public.closer_anonyme_debit();

-- 5. Photos et fichiers : 20 Mo au plus par fichier, aussi côté serveur (l'appli le vérifie déjà).
update storage.buckets set file_size_limit = 20971520 where id = 'closer-photos';

-- ===== Vérification =====
select (select length(cron_key) from public.closer_push_config where id = 1) as cle_cron,
       (select count(*) from cron.job where jobname = 'closer-push') as cron_push,
       (select count(*) from pg_trigger where tgname in ('closer_items_plafond','closer_events_debit','closer_errors_debit')) as declencheurs,
       (select file_size_limit from storage.buckets where id = 'closer-photos') as limite_photos;
