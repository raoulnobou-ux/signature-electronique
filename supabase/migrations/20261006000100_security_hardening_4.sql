-- Durcissement de sécurité n° 4 (audit d'octobre 2026) : défense en profondeur.
--
-- 1) Privilèges : la RLS protège déjà chaque table, mais les rôles « anon » et
--    « authenticated » gardaient les droits d'écriture par défaut de Supabase. On les
--    retire là où aucune écriture ne passe par le navigateur : une politique ajoutée par
--    erreur ne suffirait plus à ouvrir une table.
-- 2) Dossiers : un document ne peut être rangé que dans un dossier de son propriétaire.
-- 3) Sessions : l'utilisateur peut lister ses propres sessions actives (appareil, IP).

-- 1. Visiteurs non connectés : uniquement la lecture des tarifs.
revoke all on all tables in schema public from anon;
grant select on public.plans_config to anon;
alter default privileges in schema public revoke all on tables from anon;

-- Tables écrites uniquement par le serveur (clé de service) : lecture seule pour
-- l'utilisateur, via la RLS.
revoke insert, update, delete on
  public.ai_faq_cache,
  public.ai_messages,
  public.audit_events,
  public.billing_notices,
  public.contact_messages,
  public.document_versions,
  public.payment_events,
  public.payments,
  public.plans_config,
  public.rate_limit_hits,
  public.request_signers,
  public.signature_requests,
  public.subscriptions,
  public.team_invitations,
  public.team_members,
  public.usage_counters
from authenticated;
-- Conversations : seule la suppression passe par le navigateur.
revoke insert, update on public.ai_conversations from authenticated;
-- Profils : créés par le déclencheur d'inscription, supprimés avec le compte.
revoke insert, delete on public.profiles from authenticated;

-- 2. Dossiers : rangement uniquement dans ses propres dossiers.
create or replace function public.owns_folder(p_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_folder_id is null or exists (
    select 1 from public.folders f
    where f.id = p_folder_id and f.owner_id = (select auth.uid())
  );
$$;
revoke execute on function public.owns_folder(uuid) from public, anon;
grant execute on function public.owns_folder(uuid) to authenticated;

drop policy "documents: modification" on public.documents;
create policy "documents: modification" on public.documents
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (team_id is null or public.is_team_member(team_id))
    and public.owns_folder(folder_id)
  );

drop policy "dossiers: propriétaire" on public.folders;
create policy "dossiers: propriétaire" on public.folders
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.owns_folder(parent_id));

-- Un document mis à la corbeille n'est plus visible que de son propriétaire (plus des
-- membres de son équipe), ni téléchargeable avant restauration.
drop policy "documents: lecture" on public.documents;
create policy "documents: lecture" on public.documents
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (team_id is not null and trashed_at is null and public.is_team_member(team_id))
  );

-- Même règle pour les versions, zones et journal (fonction partagée par ces politiques).
create or replace function public.can_read_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_document_id
      and (
        d.owner_id = (select auth.uid())
        or (d.team_id is not null and d.trashed_at is null and public.is_team_member(d.team_id))
      )
  );
$$;

-- 3. Sessions actives de l'utilisateur (lecture seule, ses propres sessions uniquement).
create or replace function public.my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  last_active_at timestamptz,
  user_agent text,
  ip text,
  current boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.created_at,
    coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at),
    s.user_agent,
    host(s.ip),
    s.id::text = coalesce((select auth.jwt() ->> 'session_id'), '')
  from auth.sessions s
  where s.user_id = (select auth.uid())
    and (s.not_after is null or s.not_after > now())
  order by 3 desc
  limit 20;
$$;
revoke execute on function public.my_sessions() from public, anon;
grant execute on function public.my_sessions() to authenticated;
