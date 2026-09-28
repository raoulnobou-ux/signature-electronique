import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, getUserAgent } from "@/lib/request";

export type AuditEvent = {
  documentId?: string | null;
  requestId?: string | null;
  actorType: "user" | "signer" | "system";
  actorId?: string | null;
  actorLabel?: string | null;
  eventType: string;
  metadata?: Record<string, Json>;
};

/**
 * Journal d'audit (ajout seul) : horodatage serveur, adresse IP et appareil.
 * Une erreur d'écriture est journalisée mais ne bloque pas l'action de l'utilisateur.
 */
export async function recordAudit(event: AuditEvent): Promise<void> {
  const [ip, userAgent] = await Promise.all([
    getClientIp().catch(() => null),
    getUserAgent().catch(() => null),
  ]);
  const { error } = await createAdminClient()
    .from("audit_events")
    .insert({
      document_id: event.documentId ?? null,
      request_id: event.requestId ?? null,
      actor_type: event.actorType,
      actor_id: event.actorId ?? null,
      actor_label: event.actorLabel ?? null,
      event_type: event.eventType,
      ip: ip && /^[0-9a-f:.]+$/i.test(ip) ? ip : null,
      user_agent: userAgent?.slice(0, 400) ?? null,
      metadata: event.metadata ?? {},
    });
  if (error) console.error("[audit] écriture impossible", event.eventType, error);
}
