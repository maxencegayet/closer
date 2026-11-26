-- Closer · « Une remarque ? » dans les Réglages (audit n° 4, piste 8).
-- Un avis écrit en deux secondes dans l'appli, au lieu d'un e-mail à rédiger.
-- Ajout seulement (personne ne peut relire les remarques depuis l'appli) ; lecture depuis le SQL Editor.
-- Exécuté le 26 nov. 2026 vers 17 h 55.

create table if not exists public.closer_remarks (
  id bigint generated always as identity primary key,
  aid uuid not null,                                        -- appareil (même identifiant anonyme que les statistiques)
  user_id uuid default auth.uid(),                          -- compte, si la personne est connectée
  txt text not null check (length(txt) between 1 and 1000),
  v text check (length(v) <= 24),
  ua text check (length(ua) <= 40),
  created_at timestamptz not null default now()
);
alter table public.closer_remarks enable row level security;
drop policy if exists "ajout" on public.closer_remarks;
create policy "ajout" on public.closer_remarks for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
grant insert on public.closer_remarks to anon, authenticated;

-- Débit : au plus 5 remarques par appareil et par heure, 500 par heure en tout (au-delà, ignorées sans erreur).
create index if not exists closer_remarks_debit on public.closer_remarks (aid, created_at);
create or replace function public.closer_remarques_debit() returns trigger language plpgsql security definer set search_path = '' as $$
declare n_app int; n_tout int;
begin
  select count(*) into n_app from public.closer_remarks where aid = new.aid and created_at > now() - interval '1 hour';
  select count(*) into n_tout from public.closer_remarks where created_at > now() - interval '1 hour';
  if n_app >= 5 or n_tout >= 500 then return null; end if;
  return new;
end $$;
drop trigger if exists closer_remarks_debit on public.closer_remarks;
create trigger closer_remarks_debit before insert on public.closer_remarks for each row execute function public.closer_remarques_debit();

-- ===== Lire les remarques (le dimanche, avec supabase/point-du-dimanche.sql) =====
-- select created_at, txt, v, ua, (user_id is not null) as connecte
-- from public.closer_remarks order by created_at desc limit 50;
