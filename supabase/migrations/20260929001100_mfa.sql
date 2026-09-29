-- Double authentification (TOTP) : un compte qui a activé la 2FA n'accède à ses données
-- qu'avec une session de niveau aal2 (mot de passe + code). Appliqué par la base elle-même
-- (politiques restrictives), en plus des redirections de l'application.

create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = (select auth.uid()) and f.status = 'verified'
    );
$$;

revoke all on function public.mfa_satisfied() from public;
grant execute on function public.mfa_satisfied() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_conversations', 'ai_messages', 'audit_events', 'document_tags', 'document_versions',
    'documents', 'folders', 'payments', 'placed_fields', 'profiles', 'request_signers',
    'signature_assets', 'signature_requests', 'subscriptions', 'tags', 'team_invitations',
    'team_members', 'teams', 'templates', 'usage_counters'
  ] loop
    execute format(
      'create policy "2fa: session vérifiée" on public.%I as restrictive for all to authenticated using (public.mfa_satisfied()) with check (public.mfa_satisfied())',
      t
    );
  end loop;
end $$;

create policy "2fa: session vérifiée" on storage.objects
  as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());
