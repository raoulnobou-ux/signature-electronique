-- Limitation de débit générique (authentification, liens de signature, IA, contact)
-- et messages du formulaire de contact.

create table public.rate_limit_hits (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_hits_bucket_idx on public.rate_limit_hits (bucket, created_at desc);

alter table public.rate_limit_hits enable row level security;
-- Aucune politique : table réservée au rôle service.

/**
 * Enregistre une tentative pour `p_bucket` et indique si elle est autorisée
 * (au plus p_max tentatives sur la fenêtre glissante p_window).
 * Le verrou consultatif sérialise les appels concurrents sur une même clé.
 */
create or replace function public.check_rate_limit(p_bucket text, p_max integer, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  hits integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_bucket, 0));

  select count(*) into hits
  from public.rate_limit_hits
  where bucket = p_bucket and created_at > now() - p_window;

  if hits >= p_max then
    return false;
  end if;

  insert into public.rate_limit_hits (bucket) values (p_bucket);
  return true;
end;
$$;

revoke execute on function public.check_rate_limit(text, integer, interval) from public, anon, authenticated;

-- Purge des anciennes entrées (appelée par la tâche planifiée quotidienne).
create or replace function public.purge_rate_limit_hits()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.rate_limit_hits where created_at < now() - interval '2 days';
$$;

revoke execute on function public.purge_rate_limit_hits() from public, anon, authenticated;

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) between 5 and 254),
  organization text check (char_length(organization) <= 160),
  message text not null check (char_length(message) between 10 and 5000),
  user_id uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;
-- Aucune politique : écrit et lu par le serveur uniquement.
