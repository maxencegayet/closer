-- Photos et fichiers joints aux notes du Brouillon (25 nov. 2026)
-- Seau privé « closer-photos » : chaque compte ne voit et ne modifie que son dossier (nom du dossier = id du compte).
-- À exécuter une fois dans Supabase › SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit)
values ('closer-photos', 'closer-photos', false, 20971520)   -- 20 Mo par fichier
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "closer-photos : lire les siennes" on storage.objects;
drop policy if exists "closer-photos : ajouter les siennes" on storage.objects;
drop policy if exists "closer-photos : remplacer les siennes" on storage.objects;
drop policy if exists "closer-photos : supprimer les siennes" on storage.objects;

create policy "closer-photos : lire les siennes" on storage.objects for select to authenticated
  using (bucket_id = 'closer-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "closer-photos : ajouter les siennes" on storage.objects for insert to authenticated
  with check (bucket_id = 'closer-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "closer-photos : remplacer les siennes" on storage.objects for update to authenticated
  using (bucket_id = 'closer-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'closer-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "closer-photos : supprimer les siennes" on storage.objects for delete to authenticated
  using (bucket_id = 'closer-photos' and (storage.foldername(name))[1] = auth.uid()::text);
