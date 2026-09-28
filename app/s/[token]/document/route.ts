import { NextResponse } from "next/server";
import { loadSignerContext } from "@/lib/requests/service";
import { createAdminClient } from "@/lib/supabase/admin";

/** Téléchargement pour le signataire : document final (et certificat) une fois tout le monde signé. */
export async function GET(request: Request, ctx: RouteContext<"/s/[token]/document">) {
  const { token } = await ctx.params;
  const context = await loadSignerContext(token);
  if (!context || context.state !== "completed") return NextResponse.json({ error: "not_found" }, { status: 404 });
  const which = new URL(request.url).searchParams.get("fichier");
  const admin = createAdminClient();
  const name = context.document.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 120);
  const signed =
    which === "certificat" && context.request.certificate_path
      ? await admin.storage.from("certificates").createSignedUrl(context.request.certificate_path, 120, { download: `Certificat - ${name}.pdf` })
      : await admin.storage.from("documents").createSignedUrl(context.document.pdfPath, 120, { download: `${name} (signé).pdf` });
  if (!signed.data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.redirect(signed.data.signedUrl, 303);
}
