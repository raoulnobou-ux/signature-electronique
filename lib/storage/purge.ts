import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const USER_BUCKETS = [
  "documents",
  "signatures",
  "avatars",
  "receipts",
  "certificates",
] as const;

/** Liste récursivement les fichiers d'un dossier de stockage. */
async function listFiles(bucket: string, prefix: string): Promise<string[]> {
  const admin = createAdminClient();
  const files: string[] = [];
  const queue = [prefix];
  while (queue.length) {
    const folder = queue.shift()!;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(folder, { limit: 1000, offset });
      if (error || !data?.length) break;
      for (const entry of data) {
        const path = `${folder}/${entry.name}`;
        // Les dossiers n'ont pas d'identifiant dans l'API de listing.
        if (entry.id === null) queue.push(path);
        else files.push(path);
      }
      if (data.length < 1000) break;
    }
  }
  return files;
}

/** Supprime tous les fichiers d'un utilisateur (suppression de compte). */
export async function purgeUserFiles(userId: string): Promise<void> {
  const admin = createAdminClient();
  for (const bucket of USER_BUCKETS) {
    const files = await listFiles(bucket, userId);
    for (let i = 0; i < files.length; i += 100) {
      const { error } = await admin.storage.from(bucket).remove(files.slice(i, i + 100));
      if (error) console.error(`[storage] purge ${bucket}`, error);
    }
  }
}
