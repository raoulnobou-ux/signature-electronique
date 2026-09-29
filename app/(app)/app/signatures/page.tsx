import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { requireAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";
import { listSignatureAssets } from "./actions";
import { SignaturesView } from "./signatures-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("signatures");
  return { title: t("metaTitle") };
}

export default async function SignaturesPage() {
  const [account, assets] = await Promise.all([requireAccount(), listSignatureAssets()]);
  const ent = account.entitlements;
  const { data: membership } = await (
    await createClient()
  )
    .from("team_members")
    .select("team_id")
    .eq("user_id", account.userId)
    .maybeSingle();
  return (
    <div className="mx-auto max-w-6xl">
      <Suspense>
        <SignaturesView
          assets={assets}
          readOnly={ent.readOnly}
          stampsAllowed={ent.features.stamps}
          limit={ent.limits?.signatureAssets ?? null}
          inTeam={Boolean(membership)}
        />
      </Suspense>
    </div>
  );
}
