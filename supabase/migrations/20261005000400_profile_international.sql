-- Profil international : pays (ISO 3166-1 alpha-2) et devise préférée (ISO 4217).
-- L'inscription enregistre le pays détecté et le fuseau horaire de l'appareil ; le
-- téléphone devient facultatif. Les profils existants gardent leurs valeurs.
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists currency text;
alter table public.profiles add constraint profiles_country_check
  check (country is null or country ~ '^[A-Z]{2}$');
alter table public.profiles add constraint profiles_currency_check
  check (currency is null or currency ~ '^[A-Z]{3}$');
alter table public.profiles alter column timezone set default 'UTC';

grant update (country, currency) on public.profiles to authenticated;

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
    country, timezone, trial_started_at, trial_ends_at
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
    now(),
    now()
  );

  insert into public.subscriptions (user_id, plan, status, current_period_start, current_period_end)
  values (new.id, 'free', 'free', now(), now());

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
