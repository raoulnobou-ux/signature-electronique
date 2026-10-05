"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { IMAGE_MIME, sniffFileType } from "@/lib/files/sniff";
import { isCurrency } from "@/config/currencies";
import { isCountryCode, toE164, type CountryCode } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { purgeUserFiles } from "@/lib/storage/purge";
import { avatarPath, avatarUrl } from "@/lib/storage/avatars";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ACCOUNT_TYPES } from "@/lib/validation/auth";

export type SettingsResult = { ok: true } | { ok: false; error: string; field?: string };

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "tooShort").max(120, "tooLong"),
  country: z.string().length(2),
  phone: z.string().trim().max(30),
  timezone: z
    .string()
    .refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz) || tz === "UTC"),
  /** Pays de résidence (facultatif) : moyens de paiement et devise proposés. */
  residence: z.string().refine((c) => c === "" || isCountryCode(c)),
  /** Devise préférée (facultatif) ; vide = selon le pays. */
  currency: z.string().refine((c) => c === "" || isCurrency(c)),
});

export async function updateProfile(input: unknown): Promise<SettingsResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "invalid", field: String(parsed.error.issues[0]?.path[0]) };
  const phone = parsed.data.phone
    ? toE164(parsed.data.phone, parsed.data.country as CountryCode)
    : null;
  if (parsed.data.phone && !phone) return { ok: false, error: "phone", field: "phone" };

  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { data: before } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", user.id)
    .single();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone,
      timezone: parsed.data.timezone,
      country: parsed.data.residence || null,
      currency: parsed.data.currency || null,
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: "server" };

  // Un nouveau numéro devra être revérifié (OTP, Phase 8).
  if (before?.phone !== phone) {
    await createAdminClient()
      .from("profiles")
      .update({ phone_verified_at: null })
      .eq("id", user.id);
  }
  revalidatePath("/app", "layout");
  return { ok: true };
}

const organizationSchema = z.object({
  accountType: z.enum(ACCOUNT_TYPES).nullable(),
  orgName: z.string().trim().max(160),
  orgSector: z.string().trim().max(80),
  city: z.string().trim().max(80),
  orgAddress: z.string().trim().max(300),
  orgFooter: z.string().trim().max(300),
});

export async function updateOrganization(input: unknown): Promise<SettingsResult> {
  const parsed = organizationSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "invalid", field: String(parsed.error.issues[0]?.path[0]) };
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const d = parsed.data;
  const { error } = await supabase
    .from("profiles")
    .update({
      account_type: d.accountType,
      org_name: d.orgName || null,
      org_sector: d.orgSector || null,
      city: d.city || null,
      org_address: d.orgAddress || null,
      org_footer: d.orgFooter || null,
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: "server" };
  revalidatePath("/app/parametres");
  return { ok: true };
}

const preferencesSchema = z.object({
  theme: z.enum(["dark", "light", "system"]).optional(),
  emailNotifications: z.boolean().optional(),
});

export async function updatePreferences(input: unknown): Promise<SettingsResult> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const { error } = await supabase
    .from("profiles")
    .update({
      ...(parsed.data.theme ? { theme: parsed.data.theme } : {}),
      ...(parsed.data.emailNotifications !== undefined
        ? { email_notifications: parsed.data.emailNotifications }
        : {}),
    })
    .eq("id", user.id);
  return error ? { ok: false, error: "server" } : { ok: true };
}

const AVATAR_MAX = 2 * 1024 * 1024;

export async function uploadAvatar(formData: FormData): Promise<SettingsResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > AVATAR_MAX)
    return { ok: false, error: "avatar" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffFileType(bytes.subarray(0, 32));
  if (type !== "png" && type !== "jpeg" && type !== "webp") return { ok: false, error: "avatar" };

  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const admin = createAdminClient();
  const path = `${user.id}/${randomUUID()}.${type === "jpeg" ? "jpg" : type}`;
  const { error: uploadError } = await admin.storage.from("avatars").upload(path, bytes, {
    contentType: IMAGE_MIME[type],
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) return { ok: false, error: "server" };

  const { data: previous } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .single();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl(path) })
    .eq("id", user.id);
  if (error) return { ok: false, error: "server" };

  await removeStoredAvatar(previous?.avatar_url ?? null, user.id);
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function removeAvatar(): Promise<SettingsResult> {
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  const { data: previous } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .single();
  await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  await removeStoredAvatar(previous?.avatar_url ?? null, user.id);
  revalidatePath("/app", "layout");
  return { ok: true };
}

/** Supprime l'ancien avatar s'il est hébergé chez nous (pas une photo Google). */
async function removeStoredAvatar(url: string | null, userId: string) {
  const path = avatarPath(url);
  if (path?.startsWith(`${userId}/`))
    await createAdminClient().storage.from("avatars").remove([path]);
}

export async function sendPasswordChangeLink(): Promise<SettingsResult> {
  const { supabase, user } = await currentUser();
  if (!user?.email) return { ok: false, error: "unauthenticated" };
  if (!(await rateLimit("reset-email", user.email, 3, 3600)))
    return { ok: false, error: "rate_limited" };
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/reinitialiser-mot-de-passe`,
  });
  return error ? { ok: false, error: "server" } : { ok: true };
}

export async function signOutEverywhere() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/connexion?deconnecte=1");
}

export async function deleteAccount(confirmation: string): Promise<SettingsResult> {
  if (confirmation !== "SUPPRIMER") return { ok: false, error: "confirmation" };
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  await purgeUserFiles(user.id);
  const { error } = await createAdminClient().auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[compte] suppression impossible", error);
    return { ok: false, error: "server" };
  }
  await supabase.auth.signOut({ scope: "local" });
  redirect("/?compte-supprime=1");
}

/** Fuseau de l'appareil, enregistré seulement si le profil est encore en UTC (par défaut). */
export async function syncTimezone(timezone: unknown): Promise<void> {
  const parsed = profileSchema.shape.timezone.safeParse(timezone);
  if (!parsed.success || parsed.data === "UTC") return;
  const { supabase, user } = await currentUser();
  if (!user) return;
  await supabase
    .from("profiles")
    .update({ timezone: parsed.data })
    .eq("id", user.id)
    .eq("timezone", "UTC");
}
