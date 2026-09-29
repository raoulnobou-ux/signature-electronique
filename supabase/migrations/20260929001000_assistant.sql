-- Phase 8 — Assistant IA : cache des réponses aux questions fréquentes (suggestions),
-- partagé entre utilisateurs d'un même plan (aucune donnée personnelle).
create table public.ai_faq_cache (
  key text primary key,
  answer text not null,
  hits integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.ai_faq_cache enable row level security;
-- Aucune politique : serveur uniquement.

alter table public.ai_conversations add column updated_at timestamptz not null default now();
create index ai_conversations_updated_idx on public.ai_conversations (user_id, updated_at desc);
