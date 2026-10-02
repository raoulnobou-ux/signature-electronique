-- Durcissement 3 : photos de profil privées, journal d'audit inaltérable (y compris par
-- TRUNCATE et par le rôle serveur), aucun vidage de table possible depuis l'API.

-- 1. Photos de profil : bucket privé, servies par /api/avatars (URL signée).
update storage.buckets set public = false where id = 'avatars';
update public.profiles
set avatar_url = '/api/avatars/' || split_part(avatar_url, '/storage/v1/object/public/avatars/', 2)
where avatar_url like '%/storage/v1/object/public/avatars/%';

-- 2. Journal d'audit en ajout seul pour tous les rôles de l'API (navigateur et serveur).
revoke update, delete, truncate on public.audit_events from anon, authenticated, service_role;

create or replace function public.audit_events_no_truncate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_events est en ajout seul';
end;
$$;
revoke execute on function public.audit_events_no_truncate() from public, anon, authenticated;

create trigger audit_events_no_truncate
  before truncate on public.audit_events
  for each statement execute function public.audit_events_no_truncate();

-- 3. Aucun TRUNCATE depuis l'API sur les tables applicatives (défense en profondeur).
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate on public.%I from anon, authenticated', t.tablename);
  end loop;
end;
$$;
