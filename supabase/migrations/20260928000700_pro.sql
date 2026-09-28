-- Phase 7 — Fonctionnalités Pro : demandes de signature, certificat, modèles, équipe.

-- ---------------------------------------------------------------------------
-- Demandes de signature
-- ---------------------------------------------------------------------------

alter table public.signature_requests
  add column title text,
  add column sender_name text,
  add column original_sha256 text,
  add column final_sha256 text,
  add column final_version integer,
  add column certificate_path text,
  add column canceled_at timestamptz;

alter table public.request_signers
  -- Le lien est dérivé (HMAC) de l'identifiant et de cette version : on peut le
  -- renvoyer à tout moment sans jamais le stocker ; incrémenter la version le révoque.
  add column token_version integer not null default 1,
  add column invited_at timestamptz,
  add column opened_at timestamptz,
  add column consented_at timestamptz,
  add column reminder_count integer not null default 0,
  add column last_reminded_at timestamptz,
  add column signature_path text,
  add column signed_version integer,
  add column sha256_before text,
  add column sha256_after text;

create index request_signers_order_idx on public.request_signers (request_id, order_index);
create index signature_requests_pending_idx on public.signature_requests (expires_at) where status = 'pending';
create index placed_fields_signer_idx on public.placed_fields (request_signer_id) where request_signer_id is not null;

-- Les champs d'une demande envoyée sont écrits par le serveur uniquement : le propriétaire
-- ne modifie que son brouillon personnel (champs sans signataire).
drop policy "champs: écriture" on public.placed_fields;
create policy "champs: écriture" on public.placed_fields
  for all to authenticated
  using (public.owns_document(document_id) and request_signer_id is null)
  with check (
    public.owns_document(document_id)
    and request_signer_id is null
    and public.can_write((select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Modèles : copie du PDF, rôles de signataires, variables
-- ---------------------------------------------------------------------------

alter table public.templates
  add column description text check (char_length(description) <= 500),
  add column pdf_path text,
  add column page_count integer,
  -- Rôles de signataires : [{ "label": "Client" }, …] ; les champs y font référence par index.
  add column roles jsonb not null default '[]'::jsonb,
  add column use_count integer not null default 0,
  add column updated_at timestamptz not null default now();

create trigger templates_updated_at before update on public.templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Équipe : invitations, partage, parrainage du plan Pro
-- ---------------------------------------------------------------------------

create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  role text not null check (role in ('admin', 'member')),
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index team_invitations_pending_idx on public.team_invitations (team_id, lower(email))
  where accepted_at is null;

alter table public.team_invitations enable row level security;
create policy "invitations: lecture admin" on public.team_invitations
  for select to authenticated using (public.is_team_admin(team_id));
-- Écriture : serveur uniquement (jeton, limites du plan).

-- Une personne n'appartient qu'à une seule équipe à la fois (espace de travail unique).
create unique index team_members_single_team_idx on public.team_members (user_id);

-- Les membres sont gérés par le serveur (limite de places, rôles) : on retire l'écriture directe.
drop policy "membres: gestion admin" on public.team_members;

-- Partage avec l'équipe : uniquement vers une équipe dont on est membre.
drop policy "signatures: modification" on public.signature_assets;
create policy "signatures: modification" on public.signature_assets
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (team_id is null or public.is_team_member(team_id)));

drop policy "modèles: écriture" on public.templates;
create policy "modèles: écriture" on public.templates
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and public.can_write((select auth.uid()))
    and (team_id is null or public.is_team_member(team_id))
  );

drop policy "documents: modification" on public.documents;
create policy "documents: modification" on public.documents
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (team_id is null or public.is_team_member(team_id)));

/**
 * Abonnement Pro du propriétaire de l'équipe dont l'utilisateur est membre : les membres
 * d'une équipe profitent du plan Pro de son propriétaire (jusqu'à 5 personnes).
 */
create or replace function public.team_sponsor(p_user_id uuid)
returns table (
  team_id uuid,
  team_name text,
  owner_id uuid,
  plan text,
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  scheduled_plan text,
  scheduled_plan_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.name, t.owner_id, s.plan, s.status, s.current_period_end, s.cancel_at_period_end,
         s.scheduled_plan, s.scheduled_plan_at
  from public.team_members m
  join public.teams t on t.id = m.team_id
  join public.subscriptions s on s.user_id = t.owner_id
  where m.user_id = p_user_id
    and t.owner_id <> p_user_id
  limit 1;
$$;

revoke all on function public.team_sponsor(uuid) from public, anon;
grant execute on function public.team_sponsor(uuid) to service_role;

create or replace function public.my_team_sponsor()
returns table (
  team_id uuid,
  team_name text,
  owner_id uuid,
  plan text,
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  scheduled_plan text,
  scheduled_plan_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.team_sponsor((select auth.uid()));
$$;

grant execute on function public.my_team_sponsor() to authenticated;

-- Écriture autorisée : son propre abonnement, ou le plan Pro actif du propriétaire de son équipe.
create or replace function public.subscription_allows_write(
  p_plan text, p_status text, p_end timestamptz, p_cancel boolean
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    (p_status in ('trialing', 'active', 'past_due') and p_end > now())
    or (p_status in ('active', 'past_due') and not p_cancel and p_end + interval '3 days' > now());
$$;

create or replace function public.can_write(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user_id
      and public.subscription_allows_write(s.plan, s.status, s.current_period_end, s.cancel_at_period_end)
  )
  or exists (
    select 1 from public.team_sponsor(p_user_id) sp
    where sp.plan in ('pro', 'trial')
      and not (sp.scheduled_plan = 'essential' and sp.scheduled_plan_at <= now())
      and public.subscription_allows_write(sp.plan, sp.status, sp.current_period_end, sp.cancel_at_period_end)
  );
$$;

/** Journal d'activité de l'équipe (membres uniquement) : événements des membres, sans données sensibles. */
create or replace function public.team_activity(p_team_id uuid, p_limit integer default 50)
returns table (
  id bigint,
  created_at timestamptz,
  event_type text,
  actor_id uuid,
  actor_name text,
  document_id uuid,
  document_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.created_at, e.event_type, e.actor_id, p.full_name, e.document_id, d.title
  from public.audit_events e
  join public.team_members m on m.user_id = e.actor_id and m.team_id = p_team_id
  left join public.profiles p on p.id = e.actor_id
  left join public.documents d on d.id = e.document_id
  where public.is_team_member(p_team_id)
    and e.actor_type = 'user'
    and e.event_type in (
      'document.uploaded', 'document.signed', 'request.created', 'request.completed',
      'request.canceled', 'template.created', 'team.member_joined', 'team.member_removed',
      'asset.shared'
    )
  order by e.created_at desc
  limit least(greatest(p_limit, 1), 200);
$$;

grant execute on function public.team_activity(uuid, integer) to authenticated;
