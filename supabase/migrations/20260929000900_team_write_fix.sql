-- Correctif : sans changement de plan programmé (scheduled_plan NULL), l'expression
-- « not (NULL and …) » valait NULL et excluait à tort le parrainage de l'équipe.
-- subscription_allows_write dépend de now() : stable, pas immutable.

create or replace function public.subscription_allows_write(
  p_plan text, p_status text, p_end timestamptz, p_cancel boolean
)
returns boolean
language sql
stable
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
      and not coalesce(sp.scheduled_plan = 'essential' and sp.scheduled_plan_at <= now(), false)
      and public.subscription_allows_write(sp.plan, sp.status, sp.current_period_end, sp.cancel_at_period_end)
  );
$$;
