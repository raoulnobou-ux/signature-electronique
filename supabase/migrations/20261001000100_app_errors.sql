-- Journal des erreurs des services externes (Claude, paiements…), lisible par l'équipe
-- dans le tableau de bord Supabase : cause exacte d'un échec sans accès aux journaux Vercel.
-- Aucune donnée personnelle : identifiant d'utilisateur et message technique seulement.
create table public.app_errors (
  id bigint generated always as identity primary key,
  scope text not null,
  code text,
  message text not null,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index app_errors_created_idx on public.app_errors (created_at desc);
create index app_errors_user_idx on public.app_errors (user_id);

alter table public.app_errors enable row level security;
-- Aucune politique : serveur uniquement.
revoke all on public.app_errors from anon, authenticated;
