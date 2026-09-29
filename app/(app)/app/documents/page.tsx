import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { requireAccount } from "@/lib/auth/account";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DocumentsView, type DocumentRow, type Filters } from "./documents-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("documents");
  return { title: t("metaTitle") };
}

const PAGE_SIZE = 30;
const STATUSES = ["draft", "pending", "signed", "declined", "expired"] as const;

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export default async function DocumentsPage(props: PageProps<"/app/documents">) {
  const [account, params] = await Promise.all([requireAccount(), props.searchParams]);
  const filters: Filters = {
    q: one(params.q)?.slice(0, 100),
    folder: one(params.dossier),
    tag: one(params.etiquette),
    status: STATUSES.find((s) => s === one(params.statut)),
    period: (["7d", "30d", "year"] as const).find((p) => p === one(params.periode)),
    sort: (["recent", "oldest", "name"] as const).find((s) => s === one(params.tri)) ?? "recent",
    trash: one(params.vue) === "corbeille",
    limit: Math.min(300, Math.max(PAGE_SIZE, Number(one(params.limite) ?? PAGE_SIZE) || PAGE_SIZE)),
  };

  const supabase = await createClient();
  let query = supabase
    .from("documents")
    .select(
      "id, title, status, page_count, original_type, updated_at, created_at, folder_id, thumbnail_path, trashed_at, document_tags(tag_id)",
      {
        count: "exact",
      },
    )
    .eq("owner_id", account.userId);

  query = filters.trash ? query.not("trashed_at", "is", null) : query.is("trashed_at", null);
  if (filters.q) query = query.ilike("title", `%${filters.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  if (filters.folder === "aucun") query = query.is("folder_id", null);
  else if (filters.folder) query = query.eq("folder_id", filters.folder);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.period) {
    const since = new Date();
    if (filters.period === "7d") since.setDate(since.getDate() - 7);
    else if (filters.period === "30d") since.setDate(since.getDate() - 30);
    else since.setMonth(0, 1);
    query = query.gte("updated_at", since.toISOString());
  }
  if (filters.sort === "name") query = query.order("title", { ascending: true });
  else query = query.order("updated_at", { ascending: filters.sort === "oldest" });

  // Filtre par étiquette : on restreint aux documents liés.
  if (filters.tag) {
    const { data: tagged } = await supabase
      .from("document_tags")
      .select("document_id")
      .eq("tag_id", filters.tag);
    query = query.in(
      "id",
      (tagged ?? []).map((t) => t.document_id).concat("00000000-0000-0000-0000-000000000000"),
    );
  }

  const [{ data: docs, count }, { data: folders }, { data: tags }] = await Promise.all([
    query.limit(filters.limit),
    supabase.from("folders").select("id, name").eq("owner_id", account.userId).order("name"),
    supabase.from("tags").select("id, name, color").eq("owner_id", account.userId).order("name"),
  ]);

  // Vignettes : URL signées (1 h), générées en un seul appel.
  const thumbPaths = (docs ?? [])
    .map((d) => d.thumbnail_path)
    .filter((p): p is string => Boolean(p));
  const thumbs = new Map<string, string>();
  if (thumbPaths.length) {
    const { data } = await createAdminClient()
      .storage.from("documents")
      .createSignedUrls(thumbPaths, 3600);
    for (const item of data ?? [])
      if (item.path && item.signedUrl) thumbs.set(item.path, item.signedUrl);
  }

  const rows: DocumentRow[] = (docs ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    status: d.status as DocumentRow["status"],
    pageCount: d.page_count,
    originalType: d.original_type,
    updatedAt: d.updated_at,
    trashedAt: d.trashed_at,
    folderId: d.folder_id,
    thumbnailUrl: d.thumbnail_path ? (thumbs.get(d.thumbnail_path) ?? null) : null,
    tagIds: (d.document_tags ?? []).map((t) => t.tag_id),
  }));

  return (
    <div className="mx-auto max-w-7xl">
      <Suspense>
        <DocumentsView
          bulkAllowed={account.entitlements.features.bulk_sign}
          documents={rows}
          total={count ?? rows.length}
          folders={folders ?? []}
          tags={tags ?? []}
          filters={filters}
          readOnly={account.entitlements.readOnly}
        />
      </Suspense>
    </div>
  );
}
