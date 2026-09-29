import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BulkSigner } from "@/components/documents/bulk-signer";
import { requireAccount } from "@/lib/auth/account";
import { formatSignatureDate } from "@/lib/pdf/fields";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { listSignatureAssets } from "../../signatures/actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("documents.bulk");
  return { title: t("metaTitle") };
}

const MAX_BULK = 20;

/** Signature en lot (Pro) : jusqu'à 20 documents sélectionnés dans la liste. */
export default async function BulkSignPage(props: PageProps<"/app/documents/lot">) {
  const [account, params] = await Promise.all([requireAccount(), props.searchParams]);
  if (account.entitlements.readOnly || !account.entitlements.features.bulk_sign)
    redirect("/app/documents");
  const ids = (typeof params.ids === "string" ? params.ids.split(",") : [])
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, MAX_BULK);
  if (ids.length === 0) redirect("/app/documents");

  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, page_count, pdf_path, owner_id, status, trashed_at")
    .in("id", ids);
  // Ordre de la sélection ; documents en cours de demande ou à la corbeille écartés.
  const usable = ids
    .map((id) => docs?.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> =>
      Boolean(
        d && d.owner_id === account.userId && d.pdf_path && !d.trashed_at && d.status !== "pending",
      ),
    );
  if (usable.length === 0) redirect("/app/documents");

  const [{ data: signed }, assets] = await Promise.all([
    createAdminClient().storage.from("documents").createSignedUrl(usable[0]!.pdf_path!, 3600),
    listSignatureAssets(),
  ]);
  if (!signed) redirect("/app/documents");

  return (
    <BulkSigner
      documents={usable.map((d) => ({ id: d.id, title: d.title, pageCount: d.page_count ?? 1 }))}
      pdfUrl={signed.signedUrl}
      assets={assets}
      stampsAllowed={account.entitlements.features.stamps}
      defaults={{
        name: account.profile.full_name,
        dateLabel: formatSignatureDate(
          new Date(),
          account.profile.timezone,
          account.profile.city,
          account.profile.locale,
        ),
      }}
    />
  );
}
