-- Accès gratuit limité à la place de l'essai de 6 jours.
-- Nouveaux comptes : plan « free » (tableau de bord, profil, éditeur, un document,
-- une signature, quelques questions à l'assistant). Signer et exporter demandent un abonnement.
-- Les essais en cours sont honorés jusqu'à leur fin ; les essais terminés passent en gratuit.

alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions
  add constraint subscriptions_plan_check check (plan in ('free', 'trial', 'essential', 'pro'));

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in ('free', 'trialing', 'active', 'past_due', 'canceled', 'expired'));

alter table public.plans_config drop constraint if exists plans_config_plan_check;
alter table public.plans_config
  add constraint plans_config_plan_check check (plan in ('free', 'essential', 'pro'));

-- Limites de l'accès gratuit, modifiables sans redéployer (prix à 0, jamais affichés).
insert into public.plans_config (plan, currency, monthly_price, yearly_price, limits) values
  ('free', 'XAF', 0, 0,
    '{"documentsPerMonth": 0, "signatureAssets": 1, "storageBytes": 20971520, "aiMessagesPerDay": 5, "teamMembers": 1, "documentsStored": 1}')
on conflict (plan, currency) do nothing;

-- Essais déjà terminés : accès gratuit (les documents restent consultables).
update public.subscriptions set plan = 'free', status = 'free'
where plan = 'trial' and status in ('trialing', 'expired') and current_period_end <= now();

-- Inscription : compte gratuit, sans période d'essai.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  account_type text := meta ->> 'account_type';
begin
  if account_type not in ('individual', 'company', 'firm', 'school', 'ngo', 'administration') then
    account_type := null;
  end if;

  insert into public.profiles (
    id, full_name, email, phone, avatar_url, account_type, org_name, org_sector, city,
    trial_started_at, trial_ends_at
  )
  values (
    new.id,
    left(coalesce(nullif(meta ->> 'full_name', ''), nullif(meta ->> 'name', ''), ''), 120),
    coalesce(new.email, ''),
    left(nullif(meta ->> 'phone', ''), 20),
    nullif(meta ->> 'avatar_url', ''),
    account_type,
    left(nullif(meta ->> 'org_name', ''), 160),
    left(nullif(meta ->> 'org_sector', ''), 80),
    left(nullif(meta ->> 'city', ''), 80),
    now(),
    now()
  );

  insert into public.subscriptions (user_id, plan, status, current_period_start, current_period_end)
  values (new.id, 'free', 'free', now(), now());

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Brouillon de l'éditeur : ouvert à tout propriétaire du document (découverte en accès
-- gratuit). La signature finale reste vérifiée côté serveur (abonnement requis).
drop policy "champs: écriture" on public.placed_fields;
create policy "champs: écriture" on public.placed_fields
  for all to authenticated
  using (public.owns_document(document_id) and request_signer_id is null)
  with check (public.owns_document(document_id) and request_signer_id is null);

-- Instantané d'usage : nombre de documents conservés (quota de l'accès gratuit).
create or replace function public.get_usage_snapshot(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with tz as (
    select coalesce((select timezone from public.profiles where id = p_user_id), 'Africa/Douala') as name
  ),
  today as (
    select (now() at time zone (select name from tz))::date as d
  )
  select jsonb_build_object(
    'documentsSignedThisMonth', coalesce((
      select sum(u.documents_signed) from public.usage_counters u
      where u.user_id = p_user_id and u.day >= date_trunc('month', (select d from today))::date
    ), 0),
    'aiMessagesToday', coalesce((
      select u.ai_messages from public.usage_counters u
      where u.user_id = p_user_id and u.day = (select d from today)
    ), 0),
    'signatureAssetsCount', (
      select count(*) from public.signature_assets s
      where s.owner_id = p_user_id and s.type in ('signature', 'initials')
    ),
    'storageBytesUsed', coalesce((
      select sum(d.size_bytes) from public.documents d where d.owner_id = p_user_id
    ), 0),
    'documentsStored', (
      select count(*) from public.documents d
      where d.owner_id = p_user_id and d.trashed_at is null
    )
  );
$$;
