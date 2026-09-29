import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Masque une adresse e-mail pour l'affichage public (« a•••@gmail.com »). */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [user, domain] = email.split("@");
  if (!user || !domain) return null;
  return `${user[0]}${"•".repeat(Math.min(5, Math.max(2, user.length - 1)))}@${domain}`;
}

export interface Verification {
  requestId: string;
  title: string;
  status: string;
  senderName: string | null;
  createdAt: string;
  completedAt: string | null;
  finalSha256: string | null;
  originalSha256: string | null;
  signers: { name: string; email: string | null; status: string; signedAt: string | null }[];
  /** Toutes les empreintes connues du document (original, versions intermédiaires, final). */
  hashes: { sha256: string; kind: "original" | "intermediate" | "final" }[];
}

/** Informations publiques d'une demande (page /verify/[id], ouverte par le QR code du certificat). */
export async function getVerification(requestId: string): Promise<Verification | null> {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return null;
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("signature_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || request.status === "draft") return null;
  const [{ data: signers }, { data: versions }] = await Promise.all([
    admin
      .from("request_signers")
      .select("name, email, status, signed_at, order_index")
      .eq("request_id", requestId)
      .order("order_index"),
    admin
      .from("document_versions")
      .select("version, sha256")
      .eq("document_id", request.document_id)
      .order("version"),
  ]);
  const hashes: Verification["hashes"] = (versions ?? []).map((v) => ({
    sha256: v.sha256,
    kind:
      v.sha256 === request.final_sha256
        ? "final"
        : v.sha256 === request.original_sha256
          ? "original"
          : "intermediate",
  }));
  return {
    requestId,
    title: request.title ?? "Document",
    status: request.status,
    senderName: request.sender_name,
    createdAt: request.created_at,
    completedAt: request.completed_at,
    finalSha256: request.final_sha256,
    originalSha256: request.original_sha256,
    signers: (signers ?? []).map((s) => ({
      name: s.name,
      email: maskEmail(s.email),
      status: s.status,
      signedAt: s.signed_at,
    })),
    hashes,
  };
}

/** Recherche d'un fichier par son empreinte (page /verify) : divulgation minimale. */
export async function findByHash(sha256: string): Promise<
  | { found: false }
  | {
      found: true;
      title: string;
      version: number;
      createdAt: string;
      requestId: string | null;
      signed: boolean;
    }
> {
  if (!/^[0-9a-f]{64}$/.test(sha256)) return { found: false };
  const admin = createAdminClient();
  const { data: version } = await admin
    .from("document_versions")
    .select("document_id, version, created_at")
    .eq("sha256", sha256)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) return { found: false };
  const [{ data: doc }, { data: request }] = await Promise.all([
    admin.from("documents").select("title").eq("id", version.document_id).single(),
    admin
      .from("signature_requests")
      .select("id")
      .eq("document_id", version.document_id)
      .in("status", ["completed", "pending", "declined", "expired", "canceled"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    found: true,
    title: doc?.title ?? "Document",
    version: version.version,
    createdAt: version.created_at,
    requestId: request?.id ?? null,
    signed: version.version > 0,
  };
}
