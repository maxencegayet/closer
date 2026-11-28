-- Closer · fonctions internes non appelables de l'extérieur (vérification sécurité du 28 nov. 2026).
-- Ces fonctions servent seulement de déclencheurs (limites de débit, plafond d'éléments) ou de garde-fou Supabase :
-- personne ne doit pouvoir les appeler par /rest/v1/rpc. Les déclencheurs continuent de fonctionner (vérifié).
-- Exécuté le 28 nov. 2026 vers 16 h 45.
revoke execute on function public.closer_anonyme_debit() from public, anon, authenticated;
revoke execute on function public.closer_items_plafond() from public, anon, authenticated;
revoke execute on function public.closer_remarques_debit() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
-- Restent appelables, volontairement : closer_vapid_public() (clé publique des notifications),
-- delete_my_account() et closer_ics_token() (connecté seulement, n'agissent que sur auth.uid()).
