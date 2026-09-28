import type { Metadata } from "next";
import { ClientMessages } from "@/components/providers/client-messages";
import { SignerView, type SignerField } from "@/components/requests/signer-view";
import { formatLongDate } from "@/lib/format";
import { formatSignatureDate, MENTIONS } from "@/lib/pdf/fields";
import type { RequestFieldType } from "@/lib/requests/fields";
import { loadSignerContext } from "@/lib/requests/service";
import { createAdminClient } from "@/lib/supabase/admin";

// Lien personnel : jamais indexé, jamais transmis en Referer.
export const metadata: Metadata = {
  title: "Signature d'un document",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Page publique de signature : sans compte, depuis le lien unique reçu par e-mail ou WhatsApp. */
export default async function SignPage(props: PageProps<"/s/[token]">) {
  const { token } = await props.params;
  const ctx = await loadSignerContext(token);

  let pdfUrl: string | null = null;
  let fields: SignerField[] = [];
  if (ctx?.state === "ready") {
    const admin = createAdminClient();
    const [{ data: signed }, { data: owner }] = await Promise.all([
      admin.storage.from("documents").createSignedUrl(ctx.document.pdfPath, 3600),
      admin.from("profiles").select("timezone").eq("id", ctx.request.owner_id).single(),
    ]);
    pdfUrl = signed?.signedUrl ?? null;
    const today = formatSignatureDate(new Date(), owner?.timezone ?? "Africa/Douala");
    fields = ctx.fields.map((f) => {
      const type = f.type as RequestFieldType;
      return {
        id: f.id,
        type,
        page: f.page,
        x: f.x_pct,
        y: f.y_pct,
        w: f.w_pct,
        h: f.h_pct,
        required: f.required,
        value: type === "date" ? today : type === "name" ? ctx.signer.name : type === "mention" ? f.value || MENTIONS[0]! : f.value,
      };
    });
  }

  return (
    <ClientMessages namespaces={["sign", "signatures.creator", "documents.detail", "editor.tools"]}>
      <SignerView
        token={token}
        state={ctx ? ctx.state : "invalid"}
        signerName={ctx?.signer.name ?? ""}
        senderName={ctx?.request.sender_name ?? ""}
        title={ctx?.document.title ?? ""}
        message={ctx?.request.message ?? null}
        expiresAt={ctx?.request.expires_at ? formatLongDate(new Date(ctx.request.expires_at)) : null}
        pdfUrl={pdfUrl}
        fields={fields}
      />
    </ClientMessages>
  );
}
