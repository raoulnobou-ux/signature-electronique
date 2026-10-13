-- Chemins de fichiers écrits par le serveur seulement (audit du 13 octobre 2026).
--
-- Faille corrigée : un compte connecté pouvait, par l'API REST de Supabase (avec sa propre
-- session), créer un document, une signature ou un modèle, ou modifier le chemin d'image
-- de sa signature, en y inscrivant le chemin d'un fichier d'un autre compte
-- (« <autre utilisateur>/<id>.png »). Le serveur, qui lit le stockage avec la clé de
-- service, aurait ensuite signé ou intégré ce fichier : fuite d'un document ou d'une
-- signature d'autrui. Prérequis : connaître les identifiants de la victime (aléatoires,
-- mais visibles par exemple entre membres d'une équipe).
--
-- L'application crée déjà ces lignes avec la clé de service, après ses propres contrôles :
-- les droits retirés ici ne servaient qu'à cette attaque.
--
-- 1. Plus de création directe de documents, signatures et modèles ; plus de modification
--    directe des modèles ; pour les signatures, seuls le nom et « par défaut ».
-- 2. Défense en profondeur : tout chemin enregistré doit être dans le dossier de son
--    propriétaire, même pour le serveur (les données existantes ont été vérifiées).
--
-- Retour arrière : réaccorder les droits (voir 20260929001200_security_hardening.sql et
-- suivantes) puis supprimer les contraintes « *_paths_in_owner_folder ».

do $$
declare
  t text;
  c text;
begin
  foreach t in array array['documents', 'signature_assets', 'templates'] loop
    for c in
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = t
    loop
      execute format('revoke insert (%I) on public.%I from authenticated, anon', c, t);
      if t <> 'documents' then
        execute format('revoke update (%I) on public.%I from authenticated, anon', c, t);
      end if;
    end loop;
    execute format('revoke insert on public.%I from authenticated, anon', t);
  end loop;
end $$;

revoke update on public.signature_assets, public.templates from authenticated, anon;
grant update (name, is_default) on public.signature_assets to authenticated;

alter table public.documents
  add constraint documents_paths_in_owner_folder check (
    original_path like owner_id::text || '/%'
    and (pdf_path is null or pdf_path like owner_id::text || '/%')
    and (thumbnail_path is null or thumbnail_path like owner_id::text || '/%')
  ) not valid;
alter table public.documents validate constraint documents_paths_in_owner_folder;

alter table public.signature_assets
  add constraint signature_assets_paths_in_owner_folder check (
    image_path like owner_id::text || '/%'
    and (svg_path is null or svg_path like owner_id::text || '/%')
  ) not valid;
alter table public.signature_assets validate constraint signature_assets_paths_in_owner_folder;

alter table public.templates
  add constraint templates_paths_in_owner_folder check (
    pdf_path is null or pdf_path like owner_id::text || '/%'
  ) not valid;
alter table public.templates validate constraint templates_paths_in_owner_folder;
