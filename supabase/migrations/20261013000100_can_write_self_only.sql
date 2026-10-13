-- can_write(p_user_id) est appelable par tout utilisateur connecté (/rest/v1/rpc/can_write)
-- et acceptait n'importe quel identifiant : elle révélait si un autre compte avait un
-- abonnement actif. Les politiques RLS ne l'appellent qu'avec auth.uid() ; seul le serveur
-- (service_role : tâches planifiées, tests) l'interroge pour un autre compte.
-- Corps identique à 20260929000900_team_write_fix.sql, plus la garde ci-dessous.
-- Retour arrière : rejouer la définition de 20260929000900_team_write_fix.sql.
create or replace function public.can_write(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (p_user_id = (select auth.uid()) or (select auth.role()) = 'service_role')
    and (
      exists (
        select 1 from public.subscriptions s
        where s.user_id = p_user_id
          and public.subscription_allows_write(s.plan, s.status, s.current_period_end, s.cancel_at_period_end)
      )
      or exists (
        select 1 from public.team_sponsor(p_user_id) sp
        where sp.plan in ('pro', 'trial')
          and not coalesce(sp.scheduled_plan = 'essential' and sp.scheduled_plan_at <= now(), false)
          and public.subscription_allows_write(sp.plan, sp.status, sp.current_period_end, sp.cancel_at_period_end)
      )
    );
$$;
