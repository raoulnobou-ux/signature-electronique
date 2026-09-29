"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { guard, type GuardDenial } from "@/lib/auth/account";
import { sniffFileType } from "@/lib/files/sniff";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AssetType = "signature" | "initials" | "stamp";
export type AssetMethod = "draw" | "type" | "upload" | "generated";

export type SignatureAsset = {
  id: string;
  type: AssetType;
  name: string;
  method: AssetMethod;
  isDefault: boolean;
  width: number | null;
  height: number | null;
  url: string;
  createdAt: string;
  /** Élément créé par l'utilisateur (sinon : partagé par un membre de son équipe). */
  mine: boolean;
  /** Partagé avec l'équipe. */
  shared: boolean;
};

const MAX_PNG = 2 * 1024 * 1024;
const MAX_SVG = 400 * 1024;

const metaSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["signature", "initials", "stamp"]),
  method: z.enum(["draw", "type", "upload", "generated"]),
  width: z.coerce.number().int().min(1).max(8000),
  height: z.coerce.number().int().min(1).max(8000),
});

type CreateError = GuardDenial | "invalid" | "limit_reached" | "server";

/** Enregistre une signature, un paraphe ou un cachet (PNG transparent, + SVG si dessiné). */
export async function createSignatureAsset(
  formData: FormData,
): Promise<{ ok: true; asset: SignatureAsset } | { ok: false; error: CreateError }> {
  const meta = metaSchema.safeParse(Object.fromEntries(formData));
  const png = formData.get("png");
  const svg = formData.get("svg");
  if (!meta.success || !(png instanceof File) || png.size === 0 || png.size > MAX_PNG) return { ok: false, error: "invalid" };

  // Les cachets sont une fonctionnalité Pro ; les signatures/paraphes comptent dans la limite du plan.
  const access = await guard(meta.data.type === "stamp" ? "stamps" : "sign", meta.data.type === "stamp" ? undefined : { kind: "signatureAssets" });
  if (!access.ok) return { ok: false, error: access.reason === "quota_exceeded" ? "limit_reached" : access.reason };
  const userId = access.account.userId;

  const bytes = new Uint8Array(await png.arrayBuffer());
  if (sniffFileType(bytes.subarray(0, 16)) !== "png") return { ok: false, error: "invalid" };

  let svgText: string | null = null;
  if (svg instanceof File && svg.size > 0 && svg.size <= MAX_SVG) {
    svgText = await svg.text();
    // SVG produit par l'application (dessin, cachet) : aucun script ni référence externe
    // (seuls les liens internes « #… » du texte circulaire sont admis).
    if (
      !svgText.trimStart().startsWith("<svg") ||
      /<script|\son\w+\s*=|<foreignObject|<image|<use/i.test(svgText) ||
      /href\s*=\s*["'](?!#)/i.test(svgText)
    )
      svgText = null;
  }

  const admin = createAdminClient();
  const id = randomUUID();
  const imagePath = `${userId}/${id}.png`;
  const svgPath = svgText ? `${userId}/${id}.svg` : null;

  const { error: uploadError } = await admin.storage.from("signatures").upload(imagePath, bytes, { contentType: "image/png" });
  if (uploadError) return { ok: false, error: "server" };
  if (svgPath && svgText) {
    await admin.storage.from("signatures").upload(svgPath, new Blob([svgText], { type: "image/svg+xml" }), { contentType: "image/svg+xml" });
  }

  const { count } = await admin
    .from("signature_assets")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .eq("type", meta.data.type);

  const { data, error } = await admin
    .from("signature_assets")
    .insert({
      id,
      owner_id: userId,
      type: meta.data.type,
      name: meta.data.name,
      method: meta.data.method,
      image_path: imagePath,
      svg_path: svgPath,
      width: meta.data.width,
      height: meta.data.height,
      is_default: (count ?? 0) === 0,
    })
    .select("*")
    .single();
  if (error || !data) {
    await admin.storage.from("signatures").remove([imagePath, ...(svgPath ? [svgPath] : [])]);
    return { ok: false, error: "server" };
  }

  const { data: signed } = await admin.storage.from("signatures").createSignedUrl(imagePath, 3600);
  revalidatePath("/app/signatures");
  return {
    ok: true,
    asset: {
      id: data.id,
      type: data.type as AssetType,
      name: data.name,
      method: data.method as AssetMethod,
      isDefault: data.is_default,
      width: data.width,
      height: data.height,
      url: signed?.signedUrl ?? "",
      createdAt: data.created_at,
      mine: true,
      shared: false,
    },
  };
}

/** Liste des signatures accessibles (propres et partagées par l'équipe), avec URL signées. */
export async function listSignatureAssets(): Promise<SignatureAsset[]> {
  const supabase = await createClient();
  const [{ data }, { data: auth }] = await Promise.all([
    supabase.from("signature_assets").select("*").order("created_at", { ascending: true }),
    supabase.auth.getUser(),
  ]);
  if (!data?.length) return [];
  const { data: urls } = await createAdminClient()
    .storage.from("signatures")
    .createSignedUrls(
      data.map((a) => a.image_path),
      3600,
    );
  const byPath = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));
  return data.map((a) => ({
    id: a.id,
    type: a.type as AssetType,
    name: a.name,
    method: a.method as AssetMethod,
    isDefault: a.is_default,
    width: a.width,
    height: a.height,
    url: byPath.get(a.image_path) ?? "",
    createdAt: a.created_at,
    mine: a.owner_id === auth.user?.id,
    shared: Boolean(a.team_id),
  }));
}

/** Partage d'un cachet avec son équipe (bibliothèque partagée), ou retrait du partage. */
export async function setAssetShared(id: string, shared: boolean): Promise<{ ok: boolean }> {
  const owned = await ownAsset(id);
  if (!owned || owned.asset.type !== "stamp") return { ok: false };
  const admin = createAdminClient();
  const { data: member } = await admin.from("team_members").select("team_id").eq("user_id", owned.userId).maybeSingle();
  if (shared && !member) return { ok: false };
  const { error } = await owned.supabase
    .from("signature_assets")
    .update({ team_id: shared ? member!.team_id : null })
    .eq("id", id);
  if (error) return { ok: false };
  if (shared) {
    await recordAudit({ actorType: "user", actorId: owned.userId, eventType: "asset.shared", metadata: { asset_id: id } });
  }
  revalidatePath("/app/signatures");
  return { ok: true };
}

const uuid = z.uuid();

async function ownAsset(id: string) {
  if (!uuid.safeParse(id).success) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("signature_assets").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  return data ? { supabase, asset: data, userId: user.id } : null;
}

export async function renameSignatureAsset(id: string, name: string): Promise<{ ok: boolean }> {
  const parsed = z.string().trim().min(1).max(80).safeParse(name);
  const found = await ownAsset(id);
  if (!parsed.success || !found) return { ok: false };
  const { error } = await found.supabase.from("signature_assets").update({ name: parsed.data }).eq("id", id);
  revalidatePath("/app/signatures");
  return { ok: !error };
}

export async function setDefaultSignatureAsset(id: string): Promise<{ ok: boolean }> {
  const found = await ownAsset(id);
  if (!found) return { ok: false };
  // Deux étapes (index unique partiel) : on retire l'ancien défaut avant de poser le nouveau.
  await found.supabase
    .from("signature_assets")
    .update({ is_default: false })
    .eq("owner_id", found.userId)
    .eq("type", found.asset.type)
    .eq("is_default", true);
  const { error } = await found.supabase.from("signature_assets").update({ is_default: true }).eq("id", id);
  revalidatePath("/app/signatures");
  return { ok: !error };
}

export async function deleteSignatureAsset(id: string): Promise<{ ok: boolean }> {
  const found = await ownAsset(id);
  if (!found) return { ok: false };
  const { asset, supabase, userId } = found;
  const { error } = await supabase.from("signature_assets").delete().eq("id", id);
  if (error) return { ok: false };
  await createAdminClient()
    .storage.from("signatures")
    .remove([asset.image_path, ...(asset.svg_path ? [asset.svg_path] : [])]);
  // Si c'était l'élément par défaut, le plus ancien restant prend le relais.
  if (asset.is_default) {
    const { data: next } = await supabase
      .from("signature_assets")
      .select("id")
      .eq("owner_id", userId)
      .eq("type", asset.type)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (next) await supabase.from("signature_assets").update({ is_default: true }).eq("id", next.id);
  }
  revalidatePath("/app/signatures");
  return { ok: true };
}

export async function duplicateSignatureAsset(id: string): Promise<{ ok: boolean; error?: CreateError }> {
  const found = await ownAsset(id);
  if (!found) return { ok: false };
  const { asset } = found;
  const access = await guard(asset.type === "stamp" ? "stamps" : "sign", asset.type === "stamp" ? undefined : { kind: "signatureAssets" });
  if (!access.ok) return { ok: false, error: access.reason === "quota_exceeded" ? "limit_reached" : access.reason };

  const admin = createAdminClient();
  const newId = randomUUID();
  const imagePath = `${found.userId}/${newId}.png`;
  const { error: copyError } = await admin.storage.from("signatures").copy(asset.image_path, imagePath);
  if (copyError) return { ok: false, error: "server" };
  const { error } = await admin.from("signature_assets").insert({
    id: newId,
    owner_id: found.userId,
    type: asset.type,
    name: `${asset.name} (copie)`.slice(0, 80),
    method: asset.method,
    image_path: imagePath,
    width: asset.width,
    height: asset.height,
    is_default: false,
  });
  revalidatePath("/app/signatures");
  return { ok: !error };
}
