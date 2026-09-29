-- Durcissement (conseils de sécurité Supabase) :
-- 1. Les fonctions SECURITY DEFINER ne sont pas appelables sans connexion (rôle anon) :
--    les privilèges par défaut de Supabase les accordent explicitement, « revoke from public »
--    ne suffisait pas.
-- 2. team_sponsor(p_user_id) n'est plus appelable par un utilisateur (il pourrait interroger
--    le plan d'un autre compte) : seules my_team_sponsor() et can_write() l'utilisent.
-- 3. Les fonctions de déclencheur ne sont appelables par personne via l'API (un déclencheur
--    n'a pas besoin du droit EXECUTE de l'utilisateur pour s'exécuter).
-- 4. search_path figé sur les deux fonctions de déclencheur restantes.

revoke execute on function
  public.can_read_document(uuid),
  public.can_write(uuid),
  public.is_team_admin(uuid),
  public.is_team_member(uuid),
  public.mfa_satisfied(),
  public.my_team_sponsor(),
  public.my_usage_snapshot(),
  public.owns_document(uuid),
  public.team_activity(uuid, integer)
from anon;

revoke execute on function public.team_sponsor(uuid) from anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

alter function public.set_updated_at() set search_path = '';
alter function public.audit_events_immutable() set search_path = '';
