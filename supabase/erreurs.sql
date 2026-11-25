-- Closer · erreurs remontées depuis l'appli (anonymes), pour repérer un bug avant qu'on te le signale.
-- À exécuter une fois dans Supabase › SQL Editor. Sans cette table, l'appli n'envoie rien (elle essaie une fois par jour).
-- Contenu : où (w), message nettoyé (m : e-mails, liens et nombres longs effacés), version, type d'appareil.
-- Aucun lien avec les comptes ; coupé si « Statistiques anonymes » est désactivé dans les Réglages.

create table if not exists public.closer_errors (
  id bigint generated always as identity primary key,
  aid uuid not null,
  w text not null check (length(w) <= 24),
  m text not null check (length(m) <= 200),
  v text check (length(v) <= 24),
  ua text check (length(ua) <= 40),
  created_at timestamptz not null default now()
);
alter table public.closer_errors enable row level security;
drop policy if exists "ajout anonyme" on public.closer_errors;
create policy "ajout anonyme" on public.closer_errors for insert to anon, authenticated with check (true);
grant insert on public.closer_errors to anon, authenticated;

-- Ménage : on ne garde que 90 jours (chaque dimanche à 4 h).
select cron.unschedule('closer-errors-menage') where exists (select 1 from cron.job where jobname = 'closer-errors-menage');
select cron.schedule('closer-errors-menage', '0 4 * * 0',
  $$delete from public.closer_errors where created_at < now() - interval '90 days'$$);

-- ===== À lancer quand tu veux voir les erreurs =====
-- Les plus fréquentes des 7 derniers jours :
-- select w, m, v, count(*) as fois, count(distinct aid) as appareils, max(created_at) as derniere
-- from public.closer_errors where created_at > now() - interval '7 days'
-- group by 1, 2, 3 order by fois desc limit 30;
