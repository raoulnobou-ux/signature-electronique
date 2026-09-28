-- QuickSign — schéma initial
-- Toutes les tables ont la Row Level Security activée. Les écritures sensibles
-- (abonnements, paiements, journal d'audit, compteurs) sont réservées au rôle
-- service (serveur), jamais au navigateur.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Utilitaires
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Configuration des plans (prix modifiables sans redéployer)
-- ---------------------------------------------------------------------------

create table public.plans_config (
  plan text not null check (plan in ('essential', 'pro')),
  currency text not null check (currency in ('XAF', 'USD')),
  monthly_price integer not null check (monthly_price >= 0),
  yearly_price integer not null check (yearly_price >= 0),
  limits jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (plan, currency)
);

comment on column public.plans_config.monthly_price is
  'Montant dans la plus petite unité utilisée pour l''affichage : FCFA pour XAF, dollars entiers pour USD.';

insert into public.plans_config (plan, currency, monthly_price, yearly_price, limits) values
  ('essential', 'XAF', 5000, 50000,
    '{"documentsPerMonth": 50, "signatureAssets": 5, "storageBytes": 1073741824, "aiMessagesPerDay": 20, "teamMembers": 1}'),
  ('essential', 'USD', 9, 90,
    '{"documentsPerMonth": 50, "signatureAssets": 5, "storageBytes": 1073741824, "aiMessagesPerDay": 20, "teamMembers": 1}'),
  ('pro', 'XAF', 15000, 150000,
    '{"documentsPerMonth": null, "signatureAssets": null, "storageBytes": 21474836480, "aiMessagesPerDay": null, "teamMembers": 5}'),
  ('pro', 'USD', 26, 260,
    '{"documentsPerMonth": null, "signatureAssets": null, "storageBytes": 21474836480, "aiMessagesPerDay": null, "teamMembers": 5}');

-- ---------------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  phone text,
  phone_verified_at timestamptz,
  avatar_url text,
  account_type text check (account_type in ('individual', 'company', 'firm', 'school', 'ngo', 'administration')),
  org_name text,
  org_sector text,
  city text,
  org_address text,
  org_footer text,
  locale text not null default 'fr' check (locale in ('fr', 'en')),
  timezone text not null default 'Africa/Douala',
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  email_notifications boolean not null default true,
  onboarding_completed_at timestamptz,
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '6 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Abonnements et paiements
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  plan text not null check (plan in ('trial', 'essential', 'pro')),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  billing_cycle text check (billing_cycle in ('monthly', 'yearly')),
  currency text check (currency in ('XAF', 'USD')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  -- Plan qui prendra effet à la fin de la période (rétrogradation Pro → Essentiel).
  scheduled_plan text check (scheduled_plan in ('essential', 'pro')),
  provider text,
  provider_customer_id text,
  provider_sub_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create sequence public.receipt_number_seq start 1;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  provider text not null,
  provider_ref text not null unique,
  provider_tx_id text,
  amount integer not null check (amount >= 0),
  currency text not null check (currency in ('XAF', 'USD')),
  status text not null check (status in ('pending', 'successful', 'failed', 'cancelled')),
  plan text not null check (plan in ('essential', 'pro')),
  billing_cycle text not null check (billing_cycle in ('monthly', 'yearly')),
  period_start timestamptz,
  period_end timestamptz,
  receipt_number text unique,
  receipt_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- Journal brut des événements des prestataires : garantit l'idempotence des webhooks.
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null,
  event_type text,
  payload jsonb not null,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (provider, event_key)
);

-- ---------------------------------------------------------------------------
-- Équipes
-- ---------------------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  logo_url text,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- security definer : évite la récursion des politiques RLS sur team_members.
create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = p_team_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_team_admin(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = p_team_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- Droit d'écriture : essai ou abonnement en cours (+ 3 jours de grâce).
-- Sert de garde-fou en base ; les quotas fins sont vérifiés côté serveur.
-- ---------------------------------------------------------------------------

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
      and (
        (s.status in ('trialing', 'active') and s.current_period_end > now())
        or (s.status = 'past_due' and s.current_period_end + interval '3 days' > now())
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  parent_id uuid references public.folders (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default 'indigo',
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  folder_id uuid references public.folders (id) on delete set null,
  original_path text not null,
  original_type text not null,
  original_name text not null,
  size_bytes bigint not null default 0,
  pdf_path text,
  page_count integer,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'signed', 'declined', 'expired')),
  current_version integer not null default 0,
  sha256 text,
  signed_at timestamptz,
  trashed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  version integer not null,
  file_path text not null,
  sha256 text not null,
  created_by uuid references auth.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

create table public.document_tags (
  document_id uuid not null references public.documents (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (document_id, tag_id)
);

-- Accès en lecture à un document : propriétaire ou membre de son équipe.
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
      and (d.owner_id = (select auth.uid()) or (d.team_id is not null and public.is_team_member(d.team_id)))
  );
$$;

create or replace function public.owns_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_document_id and d.owner_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Signatures, cachets, champs placés
-- ---------------------------------------------------------------------------

create table public.signature_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  type text not null check (type in ('signature', 'initials', 'stamp')),
  name text not null check (char_length(name) between 1 and 80),
  method text not null check (method in ('draw', 'type', 'upload', 'generated')),
  image_path text not null,
  svg_path text,
  width integer,
  height integer,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.signature_requests (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  message text,
  mode text not null check (mode in ('sequential', 'parallel')),
  status text not null default 'pending'
    check (status in ('draft', 'pending', 'completed', 'declined', 'expired', 'canceled')),
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.request_signers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.signature_requests (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  order_index integer not null default 0,
  token_hash text not null unique,
  token_expires_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'opened', 'signed', 'declined', 'expired')),
  signed_at timestamptz,
  declined_reason text,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);

create table public.placed_fields (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  request_signer_id uuid references public.request_signers (id) on delete cascade,
  page integer not null check (page >= 0),
  x_pct real not null check (x_pct between 0 and 100),
  y_pct real not null check (y_pct between 0 and 100),
  w_pct real not null check (w_pct > 0 and w_pct <= 100),
  h_pct real not null check (h_pct > 0 and h_pct <= 100),
  rotation real not null default 0,
  opacity real not null default 1 check (opacity between 0 and 1),
  type text not null
    check (type in ('signature', 'initials', 'stamp', 'date', 'text', 'checkbox', 'name', 'mention')),
  asset_id uuid references public.signature_assets (id) on delete set null,
  value text,
  required boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Traçabilité : journal en ajout seul
-- ---------------------------------------------------------------------------

create table public.audit_events (
  id bigint generated always as identity primary key,
  document_id uuid references public.documents (id) on delete set null,
  request_id uuid references public.signature_requests (id) on delete set null,
  actor_type text not null check (actor_type in ('user', 'signer', 'system')),
  actor_id uuid,
  actor_label text,
  event_type text not null,
  ip inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.audit_events_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_events est en ajout seul';
end;
$$;

create trigger audit_events_no_update before update or delete on public.audit_events
  for each row execute function public.audit_events_immutable();

-- ---------------------------------------------------------------------------
-- Modèles, IA, usage
-- ---------------------------------------------------------------------------

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  source_document_id uuid references public.documents (id) on delete set null,
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Nouvelle conversation',
  created_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content jsonb not null,
  tool_calls jsonb,
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz not null default now()
);

create table public.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  ai_messages integer not null default 0,
  documents_signed integer not null default 0,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------------

create index documents_owner_idx on public.documents (owner_id, created_at desc);
create index documents_team_idx on public.documents (team_id) where team_id is not null;
create index documents_status_idx on public.documents (status);
create index documents_folder_idx on public.documents (folder_id);
create index document_versions_document_idx on public.document_versions (document_id);
create index folders_owner_idx on public.folders (owner_id);
create index signature_assets_owner_idx on public.signature_assets (owner_id, created_at desc);
create index placed_fields_document_idx on public.placed_fields (document_id);
create index signature_requests_owner_idx on public.signature_requests (owner_id, created_at desc);
create index signature_requests_document_idx on public.signature_requests (document_id);
create index signature_requests_status_idx on public.signature_requests (status);
create index request_signers_request_idx on public.request_signers (request_id);
create index audit_events_document_idx on public.audit_events (document_id, created_at);
create index audit_events_request_idx on public.audit_events (request_id, created_at);
create index payments_user_idx on public.payments (user_id, created_at desc);
create index subscriptions_status_idx on public.subscriptions (status, current_period_end);
create index templates_owner_idx on public.templates (owner_id);
create index ai_conversations_user_idx on public.ai_conversations (user_id, created_at desc);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);
create index team_members_user_idx on public.team_members (user_id);

-- ---------------------------------------------------------------------------
-- Création automatique du profil et de l'essai de 6 jours à l'inscription
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  trial_end timestamptz := now() + interval '6 days';
begin
  insert into public.profiles (id, full_name, email, phone, avatar_url, trial_started_at, trial_ends_at)
  values (
    new.id,
    coalesce(nullif(meta ->> 'full_name', ''), nullif(meta ->> 'name', ''), ''),
    coalesce(new.email, ''),
    nullif(meta ->> 'phone', ''),
    nullif(meta ->> 'avatar_url', ''),
    now(),
    trial_end
  );

  insert into public.subscriptions (user_id, plan, status, current_period_start, current_period_end)
  values (new.id, 'trial', 'trialing', now(), trial_end);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Garde l'e-mail du profil synchronisé avec auth.users.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.plans_config enable row level security;
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.folders enable row level security;
alter table public.tags enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_tags enable row level security;
alter table public.signature_assets enable row level security;
alter table public.signature_requests enable row level security;
alter table public.request_signers enable row level security;
alter table public.placed_fields enable row level security;
alter table public.audit_events enable row level security;
alter table public.templates enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.usage_counters enable row level security;

-- Tarifs : lisibles par tous (page Tarifs publique).
create policy "plans_config lisible par tous" on public.plans_config
  for select to anon, authenticated using (true);

-- Profil : chacun lit et modifie le sien. Les colonnes d'essai ne sont pas modifiables.
create policy "profil: lecture" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profil: modification" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke update on public.profiles from authenticated, anon;
grant update (
  full_name, phone, avatar_url, account_type, org_name, org_sector, city, org_address,
  org_footer, locale, timezone, theme, email_notifications, onboarding_completed_at
) on public.profiles to authenticated;

-- Abonnements, paiements : lecture seule pour l'utilisateur ; écriture par le serveur.
create policy "abonnement: lecture" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "paiements: lecture" on public.payments
  for select to authenticated using (user_id = (select auth.uid()));
-- payment_events : aucune politique → accessible au seul rôle service.

-- Équipes
create policy "équipe: lecture membres" on public.teams
  for select to authenticated using (owner_id = (select auth.uid()) or public.is_team_member(id));
create policy "équipe: création" on public.teams
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "équipe: modification propriétaire" on public.teams
  for update to authenticated using (owner_id = (select auth.uid()));
create policy "équipe: suppression propriétaire" on public.teams
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "membres: lecture" on public.team_members
  for select to authenticated using (public.is_team_member(team_id));
create policy "membres: gestion admin" on public.team_members
  for all to authenticated using (public.is_team_admin(team_id)) with check (public.is_team_admin(team_id));

-- Dossiers et étiquettes
create policy "dossiers: propriétaire" on public.folders
  for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "étiquettes: propriétaire" on public.tags
  for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Documents : lecture propriétaire/équipe ; création réservée aux comptes actifs.
create policy "documents: lecture" on public.documents
  for select to authenticated
  using (owner_id = (select auth.uid()) or (team_id is not null and public.is_team_member(team_id)));
create policy "documents: création" on public.documents
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.can_write((select auth.uid())));
create policy "documents: modification" on public.documents
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "documents: suppression" on public.documents
  for delete to authenticated using (owner_id = (select auth.uid()) and trashed_at is not null);

-- Seules les colonnes d'organisation sont modifiables par l'utilisateur ;
-- statut, empreinte et versions sont écrits par le serveur.
revoke update on public.documents from authenticated, anon;
grant update (title, folder_id, trashed_at, team_id) on public.documents to authenticated;

create policy "versions: lecture" on public.document_versions
  for select to authenticated using (public.can_read_document(document_id));

create policy "étiquetage: propriétaire" on public.document_tags
  for all to authenticated
  using (public.owns_document(document_id)) with check (public.owns_document(document_id));

-- Signatures et cachets
create policy "signatures: lecture" on public.signature_assets
  for select to authenticated
  using (owner_id = (select auth.uid()) or (team_id is not null and public.is_team_member(team_id)));
create policy "signatures: création" on public.signature_assets
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.can_write((select auth.uid())));
create policy "signatures: modification" on public.signature_assets
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "signatures: suppression" on public.signature_assets
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Champs placés (brouillon de l'éditeur)
create policy "champs: lecture" on public.placed_fields
  for select to authenticated using (public.can_read_document(document_id));
create policy "champs: écriture" on public.placed_fields
  for all to authenticated
  using (public.owns_document(document_id))
  with check (public.owns_document(document_id) and public.can_write((select auth.uid())));

-- Demandes de signature : visibles par leur propriétaire ; écrites par le serveur.
create policy "demandes: lecture" on public.signature_requests
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "signataires: lecture" on public.request_signers
  for select to authenticated
  using (exists (
    select 1 from public.signature_requests r
    where r.id = request_id and r.owner_id = (select auth.uid())
  ));

-- Journal d'audit : lecture par le propriétaire du document ; insertion par le serveur uniquement.
create policy "audit: lecture" on public.audit_events
  for select to authenticated
  using (
    (document_id is not null and public.can_read_document(document_id))
    or (actor_type = 'user' and actor_id = (select auth.uid()))
  );

-- Modèles
create policy "modèles: lecture" on public.templates
  for select to authenticated
  using (owner_id = (select auth.uid()) or (team_id is not null and public.is_team_member(team_id)));
create policy "modèles: écriture" on public.templates
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and public.can_write((select auth.uid())));

-- Assistant IA : l'historique est écrit par le serveur, lu par l'utilisateur.
create policy "conversations: lecture" on public.ai_conversations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "conversations: suppression" on public.ai_conversations
  for delete to authenticated using (user_id = (select auth.uid()));
create policy "messages: lecture" on public.ai_messages
  for select to authenticated
  using (exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid())
  ));

create policy "usage: lecture" on public.usage_counters
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Stockage : buckets privés, un dossier par utilisateur (<user_id>/...)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('documents', 'documents', false, 26214400, null),
  ('signatures', 'signatures', false, 5242880, array['image/png', 'image/svg+xml']),
  ('receipts', 'receipts', false, 5242880, array['application/pdf']),
  ('certificates', 'certificates', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "stockage documents: lecture" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "stockage documents: suppression" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "stockage signatures: lecture" on storage.objects
  for select to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "stockage signatures: suppression" on storage.objects
  for delete to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "stockage reçus: lecture" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "stockage certificats: lecture" on storage.objects
  for select to authenticated
  using (bucket_id = 'certificates' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Aucune politique d'insertion pour les utilisateurs : le serveur vérifie les droits
-- et quotas puis délivre une URL d'envoi signée à usage unique (createSignedUploadUrl).
-- Le navigateur envoie le fichier directement au stockage, sans passer par la limite
-- de taille des fonctions serverless ; le serveur contrôle ensuite le type réel.
