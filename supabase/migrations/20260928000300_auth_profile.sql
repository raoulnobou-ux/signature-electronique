-- Phase 3 : profil complété à l'inscription, e-mail de bienvenue, avatars, usage.

alter table public.profiles add column welcome_email_sent_at timestamptz;

-- L'inscription transmet aussi l'étape « Profil » (facultative) dans les métadonnées.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  trial_end timestamptz := now() + interval '6 days';
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
    trial_end
  );

  insert into public.subscriptions (user_id, plan, status, current_period_start, current_period_end)
  values (new.id, 'trial', 'trialing', now(), trial_end);

  return new;
end;
$$;

-- Avatars et logos : bucket public (images non sensibles, URL non devinables),
-- écrit uniquement par le serveur.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

/**
 * Instantané d'usage pour getEntitlements, en un seul aller-retour.
 * Le mois et le jour sont calculés dans le fuseau de l'utilisateur.
 */
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
    ), 0)
  );
$$;

revoke execute on function public.get_usage_snapshot(uuid) from public, anon;
grant execute on function public.get_usage_snapshot(uuid) to authenticated, service_role;

-- Un utilisateur ne peut lire que son propre instantané.
create or replace function public.my_usage_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_usage_snapshot((select auth.uid()));
$$;

revoke execute on function public.get_usage_snapshot(uuid) from authenticated;
grant execute on function public.my_usage_snapshot() to authenticated;
