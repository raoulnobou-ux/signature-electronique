import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ClientMessages } from "@/components/providers/client-messages";
import { AcceptInvitation } from "@/components/team/accept-invitation";
import { Button } from "@/components/ui/button";
import { getCurrentAccount } from "@/lib/auth/account";
import { hashToken } from "@/lib/requests/tokens";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("team.invitation");
  return { title: t("metaTitle"), robots: { index: false }, referrer: "no-referrer" };
}

/** Lien d'invitation reçu par e-mail : connexion (ou inscription) puis acceptation. */
export default async function InvitationPage(props: PageProps<"/invitation/[token]">) {
  const { token } = await props.params;
  const [account, t] = await Promise.all([getCurrentAccount(), getTranslations("team.invitation")]);
  const valid = /^[A-Za-z0-9_-]{20,100}$/.test(token);
  const { data: invite } = valid
    ? await createAdminClient()
        .from("team_invitations")
        .select("email, accepted_at, expires_at, teams!inner(name)")
        .eq("token_hash", hashToken(token))
        .maybeSingle()
    : { data: null };
  const next = encodeURIComponent(`/invitation/${token}`);

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-lift">
        <Users className="size-7" aria-hidden />
      </div>
      <h1 className="font-display text-2xl font-semibold">
        {invite ? `${t("title")} « ${invite.teams.name} »` : t("title")}
      </h1>
      {!invite || invite.accepted_at ? (
        <p className="mt-3 text-muted-foreground">{t("errors.invalid")}</p>
      ) : new Date(invite.expires_at) < new Date() ? (
        <p className="mt-3 text-muted-foreground">{t("errors.expired")}</p>
      ) : !account ? (
        <>
          <p className="mt-3 text-muted-foreground">{t("errors.unauthenticated")}</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link href={`/connexion?next=${next}`}>{t("signIn")}</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/inscription?next=${next}`}>{t("signUp")}</Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-muted-foreground">{t("body")}</p>
          <ClientMessages namespaces={["team.invitation"]}>
            <AcceptInvitation token={token} />
          </ClientMessages>
        </>
      )}
    </div>
  );
}
