-- Consentement et conservation des données (RGPD et bonnes pratiques).
-- 1) Acceptation des CGU et de la politique de confidentialité : date et version gardées
--    dans le profil (écrites par le serveur seulement).
-- 2) Registre des paiements conservé pour les obligations comptables après la suppression
--    d'un compte, sans lien avec celui-ci (user_id mis à null).
-- 3) Purge des journaux techniques anciens.

alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists terms_version text;
alter table public.profiles add constraint profiles_terms_version_check
  check (terms_version is null or char_length(terms_version) <= 20);

alter table public.payments alter column user_id drop not null;
alter table public.payments drop constraint payments_user_id_fkey;
alter table public.payments add constraint payments_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

create or replace function public.purge_old_logs()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.app_errors where created_at < now() - interval '90 days';
  delete from public.billing_notices where created_at < now() - interval '2 years';
  delete from public.contact_messages where created_at < now() - interval '1 year';
$$;

revoke execute on function public.purge_old_logs() from public, anon, authenticated;
grant execute on function public.purge_old_logs() to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  account_type text := meta ->> 'account_type';
  v_country text := upper(meta ->> 'country');
  v_timezone text := meta ->> 'timezone';
  v_terms text := left(nullif(meta ->> 'terms_version', ''), 20);
begin
  if account_type not in ('individual', 'company', 'firm', 'school', 'ngo', 'administration') then
    account_type := null;
  end if;
  if v_country is null or v_country !~ '^[A-Z]{2}$' then
    v_country := null;
  end if;
  if v_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    v_timezone := 'UTC';
  end if;

  insert into public.profiles (
    id, full_name, email, phone, avatar_url, account_type, org_name, org_sector, city,
    country, timezone, terms_version, terms_accepted_at, trial_started_at, trial_ends_at
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
    v_country,
    v_timezone,
    v_terms,
    case when v_terms is not null then now() end,
    now(),
    now()
  );

  insert into public.subscriptions (user_id, plan, status, current_period_start, current_period_end)
  values (new.id, 'free', 'free', now(), now());

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
