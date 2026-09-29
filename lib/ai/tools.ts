import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import { TOUR_TARGETS, type AssistantAction, type ProposedZone } from "./events";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ToolContext {
  /** Client soumis à la RLS : l'assistant ne voit que les données de l'utilisateur. */
  supabase: Supabase;
  userId: string;
  /** Document joint par l'utilisateur à cette conversation (seul document analysable). */
  attachedDocumentId: string | null;
  emit: (action: AssistantAction) => void;
}

const ZONE_TYPES = ["signature", "initials", "date", "name", "text", "mention"] as const;

const zoneSchema = z.object({
  page: z.number().int().min(1).max(5000),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  w: z.number().min(1).max(100),
  h: z.number().min(0.5).max(100),
  type: z.enum(ZONE_TYPES),
  signer: z.string().trim().min(1).max(60),
  reason: z.string().max(200),
});

const zoneJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["page", "x", "y", "w", "h", "type", "signer", "reason"],
  properties: {
    page: { type: "integer", description: "Numéro de page (1 = première page)" },
    x: { type: "number", description: "Bord gauche en % de la largeur de la page" },
    y: { type: "number", description: "Bord haut en % de la hauteur de la page (0 = haut)" },
    w: { type: "number", description: "Largeur en % de la page" },
    h: { type: "number", description: "Hauteur en % de la page" },
    type: { type: "string", enum: [...ZONE_TYPES] },
    signer: { type: "string", description: "Rôle du signataire (« Bailleur », « Client »…)" },
    reason: { type: "string", description: "Pourquoi cette zone (texte repéré)" },
  },
} as const;

/** Zones valides : dans la page, sur une page existante. */
export function sanitizeZones(
  zones: z.infer<typeof zoneSchema>[],
  pageCount: number,
): ProposedZone[] {
  return zones
    .filter((z) => z.page <= pageCount)
    .map((z) => {
      const w = Math.min(z.w, 100);
      const h = Math.min(z.h, 100);
      return {
        page: z.page - 1,
        x: Math.min(Math.max(0, z.x), 100 - w),
        y: Math.min(Math.max(0, z.y), 100 - h),
        w,
        h,
        type: z.type,
        signer: z.signer,
        reason: z.reason,
      };
    })
    .slice(0, 60);
}

type ToolDef = {
  definition: Anthropic.Beta.BetaTool;
  schema: z.ZodType;
  run: (input: never, ctx: ToolContext) => Promise<string>;
  pro: boolean;
};

const tool = <S extends z.ZodType>(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  schema: S,
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<string>,
  pro = true,
): ToolDef => ({
  definition: {
    name,
    description,
    input_schema: inputSchema as Anthropic.Beta.BetaTool["input_schema"],
    strict: true,
    eager_input_streaming: true,
  },
  schema,
  run: run as ToolDef["run"],
  pro,
});

const uuid = z.uuid();

export const TOOLS: ToolDef[] = [
  tool(
    "show_in_app",
    "Met en évidence un élément de l'interface QuickSign pour guider l'utilisateur (visite guidée). L'application ouvre la bonne page si besoin.",
    {
      type: "object",
      additionalProperties: false,
      required: ["target", "label"],
      properties: {
        target: { type: "string", enum: [...TOUR_TARGETS], description: "Élément à montrer" },
        label: {
          type: "string",
          description: "Courte explication affichée à côté (ex. « Cliquez ici pour importer »)",
        },
      },
    },
    z.object({ target: z.enum(TOUR_TARGETS), label: z.string().max(120) }),
    async ({ target, label }, ctx) => {
      ctx.emit({ kind: "highlight", target, label });
      return "Élément mis en évidence dans l'interface.";
    },
    false,
  ),
  tool(
    "find_document",
    "Recherche les documents de l'utilisateur par titre (hors corbeille). Renvoie au plus 8 documents avec leur statut.",
    {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", description: "Mots du titre ; chaîne vide pour les plus récents" },
      },
    },
    z.object({ query: z.string().max(100) }),
    async ({ query }, ctx) => {
      let q = ctx.supabase
        .from("documents")
        .select("id, title, status, created_at, page_count")
        .is("trashed_at", null);
      const term = query.trim().replace(/[%_,()]/g, " ");
      if (term) q = q.ilike("title", `%${term}%`);
      const { data } = await q.order("updated_at", { ascending: false }).limit(8);
      const items = (data ?? []).map((d) => ({
        id: d.id,
        title: d.title,
        status: d.status,
        createdAt: d.created_at,
      }));
      if (items.length) ctx.emit({ kind: "documents", items });
      return JSON.stringify({ count: items.length, documents: data ?? [] });
    },
  ),
  tool(
    "get_document_details",
    "Détails d'un document de l'utilisateur : statut, pages, versions, demandes de signature et état des signataires.",
    {
      type: "object",
      additionalProperties: false,
      required: ["document_id"],
      properties: { document_id: { type: "string", description: "Identifiant du document" } },
    },
    z.object({ document_id: uuid }),
    async ({ document_id }, ctx) => {
      const { data: doc } = await ctx.supabase
        .from("documents")
        .select("id, title, status, page_count, created_at, signed_at, current_version, sha256")
        .eq("id", document_id)
        .maybeSingle();
      if (!doc) return JSON.stringify({ error: "Document introuvable." });
      const { data: requests } = await ctx.supabase
        .from("signature_requests")
        .select(
          "id, status, mode, created_at, expires_at, completed_at, request_signers(name, status, signed_at)",
        )
        .eq("document_id", document_id)
        .order("created_at", { ascending: false })
        .limit(5);
      return JSON.stringify({ document: doc, requests: requests ?? [] });
    },
  ),
  tool(
    "propose_signature_zones",
    "Propose les zones de signature, paraphe, date, nom ou mention du document JOINT, d'après son contenu et le relevé de lignes positionnées. L'utilisateur voit la proposition et décide de l'appliquer.",
    {
      type: "object",
      additionalProperties: false,
      required: ["document_id", "zones", "summary"],
      properties: {
        document_id: { type: "string" },
        zones: { type: "array", items: zoneJsonSchema },
        summary: { type: "string", description: "Une phrase qui résume la proposition" },
      },
    },
    z.object({
      document_id: uuid,
      zones: z.array(zoneSchema).max(60),
      summary: z.string().max(400),
    }),
    async ({ document_id, zones, summary }, ctx) => {
      if (document_id !== ctx.attachedDocumentId)
        return JSON.stringify({ error: "Seul le document joint peut être analysé." });
      const { data: doc } = await ctx.supabase
        .from("documents")
        .select("page_count")
        .eq("id", document_id)
        .maybeSingle();
      if (!doc) return JSON.stringify({ error: "Document introuvable." });
      const clean = sanitizeZones(zones, doc.page_count ?? 1);
      ctx.emit({ kind: "zones", documentId: document_id, zones: clean, summary });
      return `Proposition affichée (${clean.length} zones). L'utilisateur peut l'appliquer à une demande de signature.`;
    },
  ),
  tool(
    "prepare_signature_request",
    "Prépare une demande de signature pour un document de l'utilisateur (signataires, ordre, message, zones). Rien n'est envoyé : l'utilisateur ouvre le brouillon, vérifie et envoie lui-même.",
    {
      type: "object",
      additionalProperties: false,
      required: ["document_id", "signers", "mode", "message", "zones"],
      properties: {
        document_id: { type: "string" },
        signers: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "email", "phone"],
            properties: {
              name: {
                type: "string",
                description: "Nom complet, ou le rôle si le nom n'est pas connu",
              },
              email: { type: "string", description: "E-mail, ou chaîne vide" },
              phone: { type: "string", description: "Téléphone WhatsApp, ou chaîne vide" },
            },
          },
        },
        mode: { type: "string", enum: ["sequential", "parallel"] },
        message: { type: "string", description: "Message d'accompagnement, ou chaîne vide" },
        zones: {
          type: "array",
          items: zoneJsonSchema,
          description: "Zones proposées, ou liste vide",
        },
      },
    },
    z.object({
      document_id: uuid,
      signers: z
        .array(
          z.object({
            name: z.string().max(120),
            email: z.string().max(320),
            phone: z.string().max(30),
          }),
        )
        .min(1)
        .max(10),
      mode: z.enum(["sequential", "parallel"]),
      message: z.string().max(1000),
      zones: z.array(zoneSchema).max(60),
    }),
    async ({ document_id, signers, mode, message, zones }, ctx) => {
      const { data: doc } = await ctx.supabase
        .from("documents")
        .select("id, status, page_count, owner_id")
        .eq("id", document_id)
        .maybeSingle();
      if (!doc || doc.owner_id !== ctx.userId)
        return JSON.stringify({ error: "Document introuvable." });
      if (doc.status === "pending")
        return JSON.stringify({ error: "Une demande est déjà en cours pour ce document." });
      ctx.emit({
        kind: "request_draft",
        documentId: document_id,
        signers,
        mode,
        message,
        zones: sanitizeZones(zones, doc.page_count ?? 1),
      });
      return "Brouillon de demande affiché : l'utilisateur l'ouvre, vérifie et envoie.";
    },
  ),
  tool(
    "draft_document",
    "Rédige un document (contrat simple, attestation, lettre, procès-verbal…). Le texte est affiché ; l'utilisateur crée le PDF d'un clic s'il le souhaite.",
    {
      type: "object",
      additionalProperties: false,
      required: ["title", "body"],
      properties: {
        title: { type: "string" },
        body: {
          type: "string",
          description:
            "Texte complet. Lignes « # » pour les titres, « - » pour les listes, ligne vide entre paragraphes.",
        },
      },
    },
    z.object({ title: z.string().trim().min(1).max(160), body: z.string().min(1).max(30_000) }),
    async ({ title, body }, ctx) => {
      ctx.emit({ kind: "draft_document", title, body });
      return "Brouillon affiché à l'utilisateur. Rappelle-lui de le faire relire par un professionnel si l'enjeu est important.";
    },
  ),
  tool(
    "list_pending_signatures",
    "Liste les demandes de signature en cours de l'utilisateur et les signataires qui n'ont pas encore signé (pour proposer des relances).",
    { type: "object", additionalProperties: false, required: [], properties: {} },
    z.object({}),
    async (_input, ctx) => {
      const { data } = await ctx.supabase
        .from("signature_requests")
        .select(
          "id, title, created_at, expires_at, request_signers(id, name, status, invited_at, last_reminded_at)",
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20);
      const items = (data ?? []).flatMap((r) =>
        r.request_signers
          .filter((s) => s.status === "sent" || s.status === "opened")
          .map((s) => ({
            signerId: s.id,
            name: s.name,
            documentTitle: r.title ?? "Document",
            requestId: r.id,
            status: s.status,
          })),
      );
      if (items.length) ctx.emit({ kind: "remind", items });
      return JSON.stringify({ pending_requests: data?.length ?? 0, signers_to_remind: items });
    },
  ),
  tool(
    "explain_certificate",
    "Données du certificat de signature d'une demande de l'utilisateur (signataires, horodatages, empreintes, chronologie), pour l'expliquer simplement.",
    {
      type: "object",
      additionalProperties: false,
      required: ["request_id"],
      properties: { request_id: { type: "string" } },
    },
    z.object({ request_id: uuid }),
    async ({ request_id }, ctx) => {
      const { data: request } = await ctx.supabase
        .from("signature_requests")
        .select(
          "id, title, status, mode, created_at, completed_at, original_sha256, final_sha256, request_signers(name, status, signed_at, sha256_before, sha256_after)",
        )
        .eq("id", request_id)
        .maybeSingle();
      if (!request) return JSON.stringify({ error: "Demande introuvable." });
      const { data: events } = await ctx.supabase
        .from("audit_events")
        .select("created_at, event_type, actor_label")
        .eq("request_id", request_id)
        .order("created_at")
        .limit(50);
      return JSON.stringify({ request, events: events ?? [], verify_url: `/verify/${request_id}` });
    },
  ),
];

export function toolsFor(pro: boolean): ToolDef[] {
  return TOOLS.filter((t) => pro || !t.pro);
}

/** Exécute un appel d'outil après validation stricte de ses paramètres. */
export async function runTool(
  defs: ToolDef[],
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<{ content: string; isError: boolean }> {
  const def = defs.find((d) => d.definition.name === name);
  if (!def) return { content: JSON.stringify({ error: `Outil inconnu : ${name}` }), isError: true };
  const parsed = def.schema.safeParse(input);
  if (!parsed.success)
    return {
      content: JSON.stringify({ INVALID_INPUT: parsed.error.issues.slice(0, 5) }),
      isError: true,
    };
  try {
    return { content: await def.run(parsed.data as never, ctx), isError: false };
  } catch (error) {
    console.error("[assistant] outil", name, error);
    return { content: JSON.stringify({ error: "L'outil a échoué." }), isError: true };
  }
}
