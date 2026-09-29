import { Users } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app/page-header";
import { ProUpsell } from "@/components/app/pro-upsell";
import { TeamView } from "@/components/team/team-view";
import { requireAccount } from "@/lib/auth/account";
import { DEFAULT_LIMITS } from "@/lib/entitlements/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("team");
  return { title: t("metaTitle") };
}

export default async function TeamPage() {
  const [account, t] = await Promise.all([requireAccount(), getTranslations("team")]);
  const admin = createAdminClient();
  const { data: mine } = await admin
    .from("team_members")
    .select("role, teams!inner(id, name, owner_id, created_at)")
    .eq("user_id", account.userId)
    .maybeSingle();

  if (!mine) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title={t("title")} description={t("description")} />
        {account.entitlements.features.team ? (
          <TeamView team={null} />
        ) : (
          <ProUpsell icon={Users} title={t("proTitle")} text={t("proText")} cta={t("upgrade")} />
        )}
      </div>
    );
  }

  const team = mine.teams;
  const role = mine.role as "owner" | "admin" | "member";
  const supabase = await createClient();
  const [{ data: members }, { data: invitations }, { data: activity }] = await Promise.all([
    admin
      .from("team_members")
      .select("user_id, role, created_at")
      .eq("team_id", team.id)
      .order("created_at"),
    role === "member"
      ? Promise.resolve({ data: [] })
      : admin
          .from("team_invitations")
          .select("id, email, role, expires_at")
          .eq("team_id", team.id)
          .is("accepted_at", null)
          .order("created_at"),
    supabase.rpc("team_activity", { p_team_id: team.id, p_limit: 30 }),
  ]);
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .in(
      "id",
      (members ?? []).map((m) => m.user_id),
    );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={team.name} description={t("teamDescription")} />
      <TeamView
        team={{
          id: team.id,
          name: team.name,
          role,
          seatLimit: DEFAULT_LIMITS.pro.teamMembers,
          currentUserId: account.userId,
          members: (members ?? []).map((m) => {
            const p = profiles?.find((x) => x.id === m.user_id);
            return {
              userId: m.user_id,
              role: m.role as "owner" | "admin" | "member",
              name: p?.full_name || p?.email || "—",
              email: p?.email ?? "",
              avatarUrl: p?.avatar_url ?? null,
              joinedAt: m.created_at,
            };
          }),
          invitations: (invitations ?? []).map((i) => ({
            id: i.id,
            email: i.email,
            role: i.role as "admin" | "member",
            expiresAt: i.expires_at,
          })),
          activity: (activity ?? []).map((a) => ({
            id: a.id,
            at: a.created_at,
            type: a.event_type,
            actor: a.actor_name,
            document: a.document_title,
          })),
        }}
      />
    </div>
  );
}
