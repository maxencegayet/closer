-- Closer : appel de la fonction « closer-push » chaque minute.
-- À exécuter une fois dans Supabase › SQL Editor, après le déploiement de la fonction.
-- Relançable sans risque : l'ancienne planification du même nom est remplacée.
select cron.unschedule(jobid) from cron.job where jobname = 'closer-push';
select cron.schedule(
  'closer-push',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://jnhykrfvoqyjbajmcwny.supabase.co/functions/v1/closer-push',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb,
       timeout_milliseconds := 20000
     ) $$
);
