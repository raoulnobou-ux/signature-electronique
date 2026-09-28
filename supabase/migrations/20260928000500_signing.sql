-- Phase 5 : bibliothèque de signatures et signature des documents.

-- Une seule signature (ou un seul paraphe, un seul cachet) par défaut et par utilisateur.
create unique index signature_assets_one_default_idx
  on public.signature_assets (owner_id, type) where is_default;

/** Incrémente un compteur d'usage du jour (fuseau de l'utilisateur). Rôle service uniquement. */
create or replace function public.increment_usage(p_user_id uuid, p_kind text, p_amount integer default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text := coalesce((select timezone from public.profiles where id = p_user_id), 'Africa/Douala');
  today date := (now() at time zone tz)::date;
begin
  if p_kind not in ('documents_signed', 'ai_messages') then
    raise exception 'compteur inconnu : %', p_kind;
  end if;
  insert into public.usage_counters (user_id, day) values (p_user_id, today) on conflict do nothing;
  if p_kind = 'documents_signed' then
    update public.usage_counters set documents_signed = documents_signed + p_amount where user_id = p_user_id and day = today;
  else
    update public.usage_counters set ai_messages = ai_messages + p_amount where user_id = p_user_id and day = today;
  end if;
end;
$$;

revoke execute on function public.increment_usage(uuid, text, integer) from public, anon, authenticated;
