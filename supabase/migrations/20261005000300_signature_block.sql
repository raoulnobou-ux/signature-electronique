-- Bloc professionnel réutilisable : signature + nom + fonction + structure + date + cachet,
-- posé en une fois dans l'éditeur. Préférences de l'utilisateur, modifiables par lui seul.
alter table public.profiles add column if not exists signature_block jsonb;

alter table public.profiles add constraint profiles_signature_block_check check (
  signature_block is null
  or (jsonb_typeof(signature_block) = 'object' and pg_column_size(signature_block) < 2048)
);

grant update (signature_block) on public.profiles to authenticated;
