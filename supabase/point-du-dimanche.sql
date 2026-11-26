-- Closer · le point du dimanche (audit n° 4, piste 5) : 15 minutes, trois chiffres, puis une question aux utilisateurs.
-- À coller dans Supabase › SQL Editor (ou à enregistrer comme requête « Point du dimanche »), puis Run.
-- Ne lit que des tables sans données personnelles (appareils anonymes, comptes comptés sans e-mail).

-- 1. Usage des 7 derniers jours : appareils actifs, et combien de jours chacun a ouvert Closer
select count(distinct aid) as appareils_actifs_7j,
       round(avg(jours), 1) as jours_d_usage_moyens,
       count(*) filter (where jours >= 5) as appareils_presque_quotidiens
from (select aid, count(distinct d) as jours from public.closer_events
      where ev = 'open' and d > current_date - 7 group by aid) t;

-- 2. Comptes et éléments : comptes modifiés cette semaine, éléments créés ou modifiés
select count(distinct user_id) as comptes_actifs_7j,
       count(*) as elements_modifies_7j
from public.closer_items
where updated_at > (extract(epoch from now() - interval '7 days') * 1000)::bigint;

-- 3. Erreurs les plus fréquentes de la semaine (version et appareil)
select w, m, v, count(*) as fois, count(distinct aid) as appareils, max(created_at) as derniere
from public.closer_errors where created_at > now() - interval '7 days'
group by 1, 2, 3 order by fois desc limit 10;

-- Puis, par écrit aux utilisateurs : « Qu'est-ce qui t'a agacé dans Closer cette semaine ? »
-- Noter les réponses telles quelles ; une nouveauté de la semaine suivante doit venir d'un de ces retours ou d'un chiffre.

-- 4. Remarques envoyées depuis l'appli (Réglages › Une remarque ?), une fois supabase/remarques.sql exécuté
select created_at, txt, v from public.closer_remarks
where created_at > now() - interval '7 days' order by created_at desc;
