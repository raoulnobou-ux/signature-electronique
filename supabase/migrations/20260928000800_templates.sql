-- Phase 7 — Modèles : ordre de signature mémorisé ; journal d'équipe : nom exact de l'import.

alter table public.templates
  add column mode text not null default 'sequential' check (mode in ('sequential', 'parallel'));

create or replace function public.team_activity(p_team_id uuid, p_limit integer default 50)
returns table (
  id bigint,
  created_at timestamptz,
  event_type text,
  actor_id uuid,
  actor_name text,
  document_id uuid,
  document_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.created_at, e.event_type, e.actor_id, p.full_name, e.document_id, d.title
  from public.audit_events e
  join public.team_members m on m.user_id = e.actor_id and m.team_id = p_team_id
  left join public.profiles p on p.id = e.actor_id
  left join public.documents d on d.id = e.document_id
  where public.is_team_member(p_team_id)
    and e.actor_type = 'user'
    and e.event_type in (
      'document.imported', 'document.signed', 'request.created', 'request.canceled',
      'template.created', 'template.used', 'team.member_joined', 'team.member_removed',
      'asset.shared', 'template.shared'
    )
  order by e.created_at desc
  limit least(greatest(p_limit, 1), 200);
$$;
