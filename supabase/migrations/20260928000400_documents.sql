-- Phase 4 : documents (vignettes, recherche, corbeille).

create extension if not exists pg_trgm with schema extensions;

alter table public.documents add column thumbnail_path text;

-- Recherche rapide par titre (« contrat kadji ») même sur de gros volumes.
create index documents_title_trgm_idx on public.documents using gin (title extensions.gin_trgm_ops);
create index documents_trashed_idx on public.documents (owner_id, trashed_at);

-- Les étiquettes et dossiers sont aussi modifiables par l'utilisateur (couleur, nom).
alter table public.folders add column color text not null default 'indigo';

/**
 * Documents en corbeille depuis plus de 30 jours : renvoie les chemins de fichiers à
 * supprimer du stockage, puis supprime les lignes (appelée par la tâche planifiée).
 */
create or replace function public.purge_trashed_documents(p_older_than interval default interval '30 days')
returns table (bucket_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with doomed as (
    delete from public.documents d
    where d.trashed_at is not null and d.trashed_at < now() - p_older_than
    returning d.id, d.owner_id
  )
  select doomed.owner_id::text || '/' || doomed.id::text from doomed;
end;
$$;

revoke execute on function public.purge_trashed_documents(interval) from public, anon, authenticated;

-- Défense en profondeur : à la création, l'utilisateur ne peut pas fixer lui-même
-- le statut, l'empreinte ou la version (écrits par le serveur).
revoke insert on public.documents from authenticated, anon;
grant insert (id, owner_id, team_id, title, folder_id, original_path, original_type, original_name, size_bytes, pdf_path, page_count)
  on public.documents to authenticated;

-- Le journal d'audit survit aux documents qu'il décrit (preuve durable) : pas de clé
-- étrangère, sinon « on delete set null » tenterait de modifier des lignes immuables.
alter table public.audit_events drop constraint audit_events_document_id_fkey;
alter table public.audit_events drop constraint audit_events_request_id_fkey;
