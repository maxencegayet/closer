-- Closer : notifications (rappels à l'heure + récap du matin).
-- À exécuter une fois dans Supabase › SQL Editor, APRÈS closer.sql.
-- Les clés de chiffrement (VAPID) sont créées par la fonction « closer-push » elle-même
-- et rangées dans closer_push_config : personne n'a à les copier à la main.

-- 1. Les appareils qui reçoivent les notifications (un abonnement par appareil).
create table if not exists public.closer_push (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  tz text not null default 'Europe/Paris',   -- fuseau de l'appareil
  morning text,                              -- heure du récap du matin « HH:MM », ou null = désactivé
  last_morning date,                         -- dernier récap envoyé (jour local)
  evening text,                              -- heure du récap du soir « HH:MM », ou null = désactivé
  created_at timestamptz not null default now()
);
-- ajoutée le 24 nov. 2026 (récap du soir) : sans effet si la colonne existe déjà
alter table public.closer_push add column if not exists evening text;
create index if not exists closer_push_user on public.closer_push (user_id);
alter table public.closer_push enable row level security;
drop policy if exists "push lire" on public.closer_push;
drop policy if exists "push creer" on public.closer_push;
drop policy if exists "push modifier" on public.closer_push;
drop policy if exists "push supprimer" on public.closer_push;
create policy "push lire" on public.closer_push for select using ((select auth.uid()) = user_id);
create policy "push creer" on public.closer_push for insert with check ((select auth.uid()) = user_id);
create policy "push modifier" on public.closer_push for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "push supprimer" on public.closer_push for delete using ((select auth.uid()) = user_id);

-- 2. Ce qui a déjà été envoyé (pour ne jamais envoyer deux fois le même rappel).
--    Pas de règle d'accès : seule la fonction (clé serveur) y touche.
create table if not exists public.closer_push_sent (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  slot text not null,                        -- « 2026-11-24 14:30 » ou « matin 2026-11-24 »
  sent_at timestamptz not null default now(),
  primary key (user_id, item_id, slot)
);
alter table public.closer_push_sent enable row level security;

-- 3. Les clés VAPID (une seule ligne). Pas de règle d'accès : la clé privée ne sort jamais du serveur.
create table if not exists public.closer_push_config (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null
);
alter table public.closer_push_config enable row level security;

-- La clé publique, elle, est faite pour être donnée aux téléphones.
create or replace function public.closer_vapid_public()
returns text language sql stable security definer set search_path = '' as $$
  select public_key from public.closer_push_config where id = 1;
$$;
revoke all on function public.closer_vapid_public() from public;
grant execute on function public.closer_vapid_public() to anon, authenticated;

-- 4. Outils pour appeler la fonction chaque minute.
create extension if not exists pg_net;
create extension if not exists pg_cron;
