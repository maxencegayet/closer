-- Closer : abonnement au calendrier (Calendrier Apple, ou tout calendrier qui accepte un lien .ics).
-- À exécuter une fois dans Supabase › SQL Editor, APRÈS closer.sql.
-- La fonction « closer-ics » lit les tâches d'un compte à partir d'une clé secrète, sans connexion :
-- l'app Calendrier ne sait pas se connecter à un compte, elle ouvre seulement un lien.

-- 1. Une clé par compte. Pas de règle d'accès : on n'y touche que par la fonction ci-dessous
--    (et la fonction « closer-ics », avec la clé serveur).
create table if not exists public.closer_ics (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);
alter table public.closer_ics enable row level security;

-- 2. Donne la clé du compte connecté (la crée au premier appel).
--    renew = true : nouvelle clé, l'ancien lien cesse de marcher tout de suite.
--    Clé : 64 caractères tirés au hasard (deux UUID aléatoires), impossible à deviner.
create or replace function public.closer_ics_token(renew boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  if not renew then
    select token into t from public.closer_ics where user_id = auth.uid();
    if t is not null then return t; end if;
  end if;
  t := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.closer_ics (user_id, token) values (auth.uid(), t)
    on conflict (user_id) do update set token = excluded.token, created_at = now();
  return t;
end $$;
revoke all on function public.closer_ics_token(boolean) from public, anon;
grant execute on function public.closer_ics_token(boolean) to authenticated;
