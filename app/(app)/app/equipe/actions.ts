"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getCurrentAccount, guard, type Account, type GuardDenial } from "@/lib/auth/account";
import { hashToken } from "@/lib/requests/tokens";
import { toLocale } from "@/i18n/config";
import { randomToken } from "@/lib/crypto";
import { sendEmail } from "@/lib/email/send";
import { teamInvitationEmail } from "@/lib/email/templates";
import { DEFAULT_LIMITS } from "@/lib/entitlements/plans";
import { publicEnv } from "@/lib/env";
import { formatLongDate } from "@/lib/format";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

type Fail<E extends string = string> = { ok: false; error: E };
type Role = "owner" | "admin" | "member";
const INVITE_DAYS = 7;

async function membership(userId: string) {
  const { data } = await createAdminClient()
    .from("team_members")
    .select("team_id, role, teams!inner(id, name, owner_id)")
    .eq("user_id", userId)
    .maybeSingle();
  return data ? { teamId: data.team_id, role: data.role as Role, team: data.teams } : null;
}

/** Places : limite du plan (propriétaire compris), membres + invitations en attente. */
async function seats(teamId: string): Promise<{ used: number; limit: number }> {
  const admin = createAdminClient();
  const [{ count: members }, { count: invites }] = await Promise.all([
    admin
      .from("team_members")
      .select("user_id", { count: "exact", head: true })
      .eq("team_id", teamId),
    admin
      .from("team_invitations")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);
  return { used: (members ?? 0) + (invites ?? 0), limit: DEFAULT_LIMITS.pro.teamMembers };
}

export async function createTeam(
  name: string,
): Promise<{ ok: true } | Fail<GuardDenial | "invalid" | "already_in_team" | "server">> {
  const parsed = z.string().trim().min(2).max(80).safeParse(name);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const access = await guard("team");
  if (!access.ok) return { ok: false, error: access.reason };
  const userId = access.account.userId;
  if (await membership(userId)) return { ok: false, error: "already_in_team" };
  const admin = createAdminClient();
  const { data: team, error } = await admin
    .from("teams")
    .insert({ owner_id: userId, name: parsed.data })
    .select("id")
    .single();
  if (error || !team) return { ok: false, error: "server" };
  const { error: memberError } = await admin
    .from("team_members")
    .insert({ team_id: team.id, user_id: userId, role: "owner" });
  if (memberError) {
    await admin.from("teams").delete().eq("id", team.id);
    return { ok: false, error: memberError.code === "23505" ? "already_in_team" : "server" };
  }
  await recordAudit({
    actorType: "user",
    actorId: userId,
    eventType: "team.created",
    metadata: { team_id: team.id },
  });
  revalidatePath("/app", "layout");
  return { ok: true };
}

async function adminContext(): Promise<{
  account: Account;
  teamId: string;
  role: Role;
  teamName: string;
} | null> {
  const account = await getCurrentAccount();
  if (!account) return null;
  const m = await membership(account.userId);
  if (!m || (m.role !== "owner" && m.role !== "admin")) return null;
  return { account, teamId: m.teamId, role: m.role, teamName: m.team.name };
}

export async function renameTeam(name: string): Promise<{ ok: boolean }> {
  const parsed = z.string().trim().min(2).max(80).safeParse(name);
  const ctx = await adminContext();
  if (!parsed.success || !ctx || ctx.role !== "owner") return { ok: false };
  await createAdminClient().from("teams").update({ name: parsed.data }).eq("id", ctx.teamId);
  revalidatePath("/app/equipe");
  return { ok: true };
}

export async function inviteMember(input: {
  email: string;
  role: "admin" | "member";
}): Promise<
  | { ok: true; emailed: boolean; link: string }
  | Fail<
      | "forbidden"
      | "invalid"
      | "no_seats"
      | "already_member"
      | "rate_limited"
      | "feature_not_in_plan"
    >
> {
  const parsed = z
    .object({ email: z.email().max(320), role: z.enum(["admin", "member"]) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const ctx = await adminContext();
  if (!ctx) return { ok: false, error: "forbidden" };
  if (!ctx.account.entitlements.features.team) return { ok: false, error: "feature_not_in_plan" };
  // Seul le propriétaire peut nommer un administrateur.
  if (parsed.data.role === "admin" && ctx.role !== "owner")
    return { ok: false, error: "forbidden" };
  if (!(await rateLimit("team-invite", ctx.account.userId, 20, 3600)))
    return { ok: false, error: "rate_limited" };
  const email = parsed.data.email.toLowerCase();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existing) {
    const { data: member } = await admin
      .from("team_members")
      .select("user_id")
      .eq("team_id", ctx.teamId)
      .eq("user_id", existing.id)
      .maybeSingle();
    if (member) return { ok: false, error: "already_member" };
  }
  // Une nouvelle invitation remplace l'éventuelle précédente pour la même adresse.
  await admin
    .from("team_invitations")
    .delete()
    .eq("team_id", ctx.teamId)
    .ilike("email", email)
    .is("accepted_at", null);
  const { used, limit } = await seats(ctx.teamId);
  if (used >= limit) return { ok: false, error: "no_seats" };

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  const { error } = await admin.from("team_invitations").insert({
    team_id: ctx.teamId,
    email,
    role: parsed.data.role,
    token_hash: hashToken(token),
    invited_by: ctx.account.userId,
    expires_at: expiresAt.toISOString(),
  });
  if (error) return { ok: false, error: "invalid" };
  const link = `${publicEnv.NEXT_PUBLIC_APP_URL}/invitation/${token}`;
  const sent = await sendEmail({
    to: email,
    ...teamInvitationEmail({
      inviterName: ctx.account.profile.full_name || ctx.account.email,
      teamName: ctx.teamName,
      link,
      expiresAt: formatLongDate(expiresAt, toLocale(ctx.account.profile.locale)),
      locale: toLocale(ctx.account.profile.locale),
    }),
  });
  await recordAudit({
    actorType: "user",
    actorId: ctx.account.userId,
    eventType: "team.member_invited",
    metadata: { team_id: ctx.teamId, role: parsed.data.role },
  });
  revalidatePath("/app/equipe");
  return { ok: true, emailed: sent.ok && !("skipped" in sent && sent.skipped), link };
}

export async function revokeInvitation(invitationId: string): Promise<{ ok: boolean }> {
  const ctx = await adminContext();
  if (!ctx || !z.uuid().safeParse(invitationId).success) return { ok: false };
  await createAdminClient()
    .from("team_invitations")
    .delete()
    .eq("id", invitationId)
    .eq("team_id", ctx.teamId)
    .is("accepted_at", null);
  revalidatePath("/app/equipe");
  return { ok: true };
}

export async function removeMember(userId: string): Promise<{ ok: boolean }> {
  const ctx = await adminContext();
  if (!ctx || !z.uuid().safeParse(userId).success || userId === ctx.account.userId)
    return { ok: false };
  const admin = createAdminClient();
  const { data: target } = await admin
    .from("team_members")
    .select("role")
    .eq("team_id", ctx.teamId)
    .eq("user_id", userId)
    .maybeSingle();
  // Le propriétaire est intouchable ; un administrateur ne retire que des membres.
  if (!target || target.role === "owner" || (ctx.role === "admin" && target.role !== "member"))
    return { ok: false };
  await admin.from("team_members").delete().eq("team_id", ctx.teamId).eq("user_id", userId);
  // Ses éléments partagés redeviennent personnels.
  await admin
    .from("signature_assets")
    .update({ team_id: null })
    .eq("owner_id", userId)
    .eq("team_id", ctx.teamId);
  await admin
    .from("templates")
    .update({ team_id: null })
    .eq("owner_id", userId)
    .eq("team_id", ctx.teamId);
  await recordAudit({
    actorType: "user",
    actorId: ctx.account.userId,
    eventType: "team.member_removed",
    metadata: { team_id: ctx.teamId, member_id: userId },
  });
  revalidatePath("/app/equipe");
  return { ok: true };
}

export async function changeRole(
  userId: string,
  role: "admin" | "member",
): Promise<{ ok: boolean }> {
  const ctx = await adminContext();
  if (
    !ctx ||
    ctx.role !== "owner" ||
    !z.uuid().safeParse(userId).success ||
    userId === ctx.account.userId
  )
    return { ok: false };
  await createAdminClient()
    .from("team_members")
    .update({ role })
    .eq("team_id", ctx.teamId)
    .eq("user_id", userId)
    .neq("role", "owner");
  revalidatePath("/app/equipe");
  return { ok: true };
}

export async function leaveTeam(): Promise<{ ok: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false };
  const m = await membership(account.userId);
  if (!m || m.role === "owner") return { ok: false };
  const admin = createAdminClient();
  await admin.from("team_members").delete().eq("team_id", m.teamId).eq("user_id", account.userId);
  await admin
    .from("signature_assets")
    .update({ team_id: null })
    .eq("owner_id", account.userId)
    .eq("team_id", m.teamId);
  await admin
    .from("templates")
    .update({ team_id: null })
    .eq("owner_id", account.userId)
    .eq("team_id", m.teamId);
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function deleteTeam(): Promise<{ ok: boolean }> {
  const ctx = await adminContext();
  if (!ctx || ctx.role !== "owner") return { ok: false };
  await createAdminClient()
    .from("teams")
    .delete()
    .eq("id", ctx.teamId)
    .eq("owner_id", ctx.account.userId);
  revalidatePath("/app", "layout");
  return { ok: true };
}

export type AcceptError =
  "unauthenticated" | "invalid" | "expired" | "wrong_email" | "already_in_team" | "no_seats";

/** Acceptation d'une invitation : même adresse e-mail, une seule équipe à la fois, places disponibles. */
export async function acceptInvitation(token: string): Promise<{ ok: true } | Fail<AcceptError>> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, error: "unauthenticated" };
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { ok: false, error: "invalid" };
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("team_invitations")
    .select("*")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!invite || invite.accepted_at) return { ok: false, error: "invalid" };
  if (new Date(invite.expires_at) < new Date()) return { ok: false, error: "expired" };
  if (invite.email.toLowerCase() !== account.email.toLowerCase())
    return { ok: false, error: "wrong_email" };
  if (await membership(account.userId)) return { ok: false, error: "already_in_team" };
  const { count } = await admin
    .from("team_members")
    .select("user_id", { count: "exact", head: true })
    .eq("team_id", invite.team_id);
  if ((count ?? 0) >= DEFAULT_LIMITS.pro.teamMembers) return { ok: false, error: "no_seats" };
  const { error } = await admin
    .from("team_members")
    .insert({ team_id: invite.team_id, user_id: account.userId, role: invite.role });
  if (error) return { ok: false, error: error.code === "23505" ? "already_in_team" : "invalid" };
  await admin
    .from("team_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);
  await recordAudit({
    actorType: "user",
    actorId: account.userId,
    eventType: "team.member_joined",
    metadata: { team_id: invite.team_id, role: invite.role },
  });
  revalidatePath("/app", "layout");
  return { ok: true };
}
