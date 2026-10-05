import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Tâche quotidienne : supprime définitivement les documents restés plus de 30 jours
 * dans la corbeille (lignes puis fichiers), et purge les compteurs de limitation et les
 * journaux anciens (durées de conservation de la politique de confidentialité).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: folders, error } = await admin.rpc("purge_trashed_documents");
  if (error) {
    console.error("[cron] purge corbeille", error);
    return NextResponse.json({ error: "purge_failed" }, { status: 500 });
  }

  let files = 0;
  for (const { bucket_path: folder } of folders ?? []) {
    const { data: list } = await admin.storage.from("documents").list(folder, { limit: 1000 });
    if (list?.length) {
      await admin.storage.from("documents").remove(list.map((f) => `${folder}/${f.name}`));
      files += list.length;
    }
  }
  await admin.rpc("purge_rate_limit_hits");
  // Journaux techniques : 90 jours ; rappels de facturation : 2 ans ; messages de contact : 1 an.
  await admin.rpc("purge_old_logs");

  return NextResponse.json({ documents: folders?.length ?? 0, files });
}
