-- Suite du durcissement : PostgreSQL accorde EXECUTE à PUBLIC par défaut, donc
-- « revoke from anon » ne suffit pas. Ces fonctions servent aux politiques RLS et aux
-- appels des utilisateurs connectés : réservées aux rôles authenticated et service.
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
from public, anon;

grant execute on function
  public.can_read_document(uuid),
  public.can_write(uuid),
  public.is_team_admin(uuid),
  public.is_team_member(uuid),
  public.mfa_satisfied(),
  public.my_team_sponsor(),
  public.my_usage_snapshot(),
  public.owns_document(uuid),
  public.team_activity(uuid, integer)
to authenticated, service_role;

revoke execute on function public.team_sponsor(uuid) from public, anon, authenticated;
grant execute on function public.team_sponsor(uuid) to service_role;

-- Index des clés étrangères (suppressions en cascade et jointures rapides).
create index if not exists contact_messages_user_idx on public.contact_messages (user_id);
create index if not exists document_tags_tag_idx on public.document_tags (tag_id);
create index if not exists document_versions_created_by_idx on public.document_versions (created_by);
create index if not exists folders_parent_idx on public.folders (parent_id);
create index if not exists payments_subscription_idx on public.payments (subscription_id);
create index if not exists placed_fields_asset_idx on public.placed_fields (asset_id);
create index if not exists signature_assets_team_idx on public.signature_assets (team_id) where team_id is not null;
create index if not exists team_invitations_invited_by_idx on public.team_invitations (invited_by);
create index if not exists teams_owner_idx on public.teams (owner_id);
create index if not exists templates_source_document_idx on public.templates (source_document_id);
create index if not exists templates_team_idx on public.templates (team_id) where team_id is not null;
