-- Devises internationales : euro et livre sterling en plus du franc CFA et du dollar.
-- La liste des devises vit dans config/currencies.ts ; la base n'impose plus qu'un code
-- ISO 4217 (trois lettres majuscules), pour ajouter une devise sans migration de contrainte.

alter table public.plans_config drop constraint if exists plans_config_currency_check;
alter table public.plans_config
  add constraint plans_config_currency_check check (currency ~ '^[A-Z]{3}$');

alter table public.subscriptions drop constraint if exists subscriptions_currency_check;
alter table public.subscriptions
  add constraint subscriptions_currency_check check (currency is null or currency ~ '^[A-Z]{3}$');

alter table public.payments drop constraint if exists payments_currency_check;
alter table public.payments
  add constraint payments_currency_check check (currency ~ '^[A-Z]{3}$');

-- Les paiements par carte ont des centimes (prorata d'un passage au Pro) : montant décimal.
alter table public.payments alter column amount type numeric(12, 2);

comment on column public.plans_config.monthly_price is
  'Montant dans l''unité principale de la devise (FCFA, euros, dollars, livres), sans conversion automatique.';

-- Prix par marché (modifiables ensuite dans plans_config, sans redéployer).
insert into public.plans_config (plan, currency, monthly_price, yearly_price, limits)
select plan, v.currency, v.monthly, v.yearly, limits
from public.plans_config
join (values
  ('essential', 'EUR', 9, 90),
  ('essential', 'GBP', 8, 80),
  ('pro', 'EUR', 25, 250),
  ('pro', 'GBP', 22, 220)
) as v(v_plan, currency, monthly, yearly) on v.v_plan = plans_config.plan
where plans_config.currency = 'USD'
on conflict (plan, currency) do nothing;

update public.plans_config set monthly_price = 10, yearly_price = 100
where plan = 'essential' and currency = 'USD';
update public.plans_config set monthly_price = 29, yearly_price = 290
where plan = 'pro' and currency = 'USD';
