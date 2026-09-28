-- Phase 6 — Abonnements et paiements
-- Paiements par période (Mobile Money n'a pas de prélèvement automatique) : chaque
-- paiement réussi prolonge l'abonnement. L'activation est atomique (complete_payment).

-- Montants en décimal : le prorata en dollars peut avoir des centimes.
alter table public.payments alter column amount type numeric(12, 2);

alter table public.payments
  add column kind text not null default 'new' check (kind in ('new', 'renewal', 'upgrade')),
  add column payment_method text,
  add column failure_reason text,
  add column paid_at timestamptz;

-- Changement de plan différé : s'applique à `scheduled_plan_at` (ex. renouvellement Essentiel
-- payé pendant une période Pro, ou rétrogradation demandée).
alter table public.subscriptions add column scheduled_plan_at timestamptz;

-- L'annulation garde le statut « active » avec cancel_at_period_end = true :
-- l'accès reste ouvert jusqu'à la fin de la période payée, sans période de grâce ensuite.
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
        (s.status in ('trialing', 'active', 'past_due') and s.current_period_end > now())
        or (
          s.status in ('active', 'past_due')
          and not s.cancel_at_period_end
          and s.current_period_end + interval '3 days' > now()
        )
      )
  );
$$;

-- Notifications de facturation déjà envoyées (rappels idempotents, même si la tâche tourne deux fois).
create table public.billing_notices (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  reference text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, reference)
);

alter table public.billing_notices enable row level security;
-- Aucune politique : réservé au rôle service.

create index payments_pending_idx on public.payments (created_at) where status = 'pending';
create index subscriptions_scheduled_idx on public.subscriptions (scheduled_plan_at)
  where scheduled_plan_at is not null;

/**
 * Valide un paiement vérifié auprès du prestataire et active l'abonnement, en une transaction.
 * Idempotent : un second appel (webhook + retour navigateur) ne fait rien.
 *
 * Règles de période :
 * - upgrade (Essentiel → Pro au prorata) : Pro immédiatement, même date de fin ;
 * - sinon, la nouvelle période commence à la fin de la période en cours si elle est encore
 *   valable (essai compris : les jours d'essai restants sont conservés), sinon maintenant ;
 * - si la nouvelle période commence plus tard avec un autre plan, le changement de plan
 *   est programmé à cette date (le plan actuel reste acquis jusque-là).
 */
create or replace function public.complete_payment(
  p_payment_id uuid,
  p_provider_tx_id text,
  p_method text
)
returns table (applied boolean, receipt_number text, period_start timestamptz, period_end timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments%rowtype;
  v_sub public.subscriptions%rowtype;
  v_interval interval;
  v_start timestamptz;
  v_end timestamptz;
  v_receipt text;
  v_valid_until timestamptz;
begin
  select * into v_pay from public.payments p where p.id = p_payment_id for update;
  if not found then
    raise exception 'payment_not_found';
  end if;
  if v_pay.status = 'successful' then
    return query select false, v_pay.receipt_number, v_pay.period_start, v_pay.period_end;
    return;
  end if;

  select * into v_sub from public.subscriptions s where s.user_id = v_pay.user_id for update;
  if not found then
    raise exception 'subscription_not_found';
  end if;

  v_interval := case v_pay.billing_cycle when 'yearly' then interval '1 year' else interval '1 month' end;
  -- Fin de la période encore valable (null si le compte est en grâce ou expiré).
  v_valid_until := case
    when v_sub.status in ('trialing', 'active', 'past_due') and v_sub.current_period_end > now()
      then v_sub.current_period_end
  end;

  v_receipt := 'QS-' || to_char(now() at time zone 'Africa/Douala', 'YYYY') || '-'
    || lpad(nextval('public.receipt_number_seq')::text, 6, '0');

  if v_pay.kind = 'upgrade' then
    v_start := now();
    v_end := greatest(v_sub.current_period_end, now());
    update public.subscriptions set
      plan = v_pay.plan,
      status = 'active',
      scheduled_plan = null,
      scheduled_plan_at = null,
      cancel_at_period_end = false,
      provider = v_pay.provider
    where id = v_sub.id;
  else
    v_start := coalesce(v_valid_until, now());
    v_end := v_start + v_interval;
    if v_valid_until is not null and v_sub.plan <> v_pay.plan then
      -- Période payée d'avance avec un autre plan (ou pendant l'essai) : bascule à la date
      -- de début ; l'essai Pro ou le plan en cours reste acquis jusque-là.
      update public.subscriptions set
        status = 'active',
        current_period_end = v_end,
        scheduled_plan = v_pay.plan,
        scheduled_plan_at = v_start,
        cancel_at_period_end = false,
        billing_cycle = v_pay.billing_cycle,
        currency = v_pay.currency,
        provider = v_pay.provider
      where id = v_sub.id;
    else
      update public.subscriptions set
        plan = v_pay.plan,
        status = 'active',
        current_period_start = case when v_valid_until is null then v_start else current_period_start end,
        current_period_end = v_end,
        scheduled_plan = null,
        scheduled_plan_at = null,
        cancel_at_period_end = false,
        billing_cycle = v_pay.billing_cycle,
        currency = v_pay.currency,
        provider = v_pay.provider
      where id = v_sub.id;
    end if;
  end if;

  update public.payments p set
    status = 'successful',
    provider_tx_id = p_provider_tx_id,
    payment_method = p_method,
    failure_reason = null,
    paid_at = now(),
    period_start = v_start,
    period_end = v_end,
    receipt_number = v_receipt,
    subscription_id = v_sub.id
  where p.id = v_pay.id;

  return query select true, v_receipt, v_start, v_end;
end;
$$;

revoke all on function public.complete_payment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.complete_payment(uuid, text, text) to service_role;
