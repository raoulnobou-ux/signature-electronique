"use client";

import {
  Check,
  Download,
  FileText,
  Folder,
  FolderPlus,
  FolderInput,
  Inbox,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  SearchX,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { UploadDialog } from "@/components/documents/upload-dialog";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useIsClient } from "@/lib/use-is-client";
import { cn } from "@/lib/utils";
import {
  createFolder,
  createTag,
  deleteDocumentsForever,
  deleteFolder,
  getDocumentFileUrl,
  moveDocuments,
  renameDocument,
  restoreDocuments,
  setTag,
  trashDocuments,
} from "./actions";

export type DocumentRow = {
  id: string;
  title: string;
  status: "draft" | "pending" | "signed" | "declined" | "expired";
  pageCount: number | null;
  originalType: string;
  updatedAt: string;
  trashedAt: string | null;
  folderId: string | null;
  thumbnailUrl: string | null;
  tagIds: string[];
};

export type Filters = {
  q?: string;
  folder?: string;
  tag?: string;
  status?: DocumentRow["status"];
  period?: "7d" | "30d" | "year";
  sort: "recent" | "oldest" | "name";
  trash: boolean;
  limit: number;
};

type FolderItem = { id: string; name: string };
type TagItem = { id: string; name: string; color: string };

const TAG_DOT: Record<string, string> = {
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  cyan: "bg-cyan-400",
  emerald: "bg-emerald-500",
  amber: "bg-amber-400",
  rose: "bg-rose-500",
  slate: "bg-slate-400",
};

type Props = {
  documents: DocumentRow[];
  total: number;
  folders: FolderItem[];
  tags: TagItem[];
  filters: Filters;
  readOnly: boolean;
};

export function DocumentsView({ documents, total, folders, tags, filters, readOnly }: Props) {
  const t = useTranslations("documents");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState(filters.q ?? "");
  const [dialog, setDialog] = useState<
    | null
    | { type: "folder" }
    | { type: "tag" }
    | { type: "rename"; doc: DocumentRow }
    | { type: "move"; ids: string[] }
    | { type: "delete"; ids: string[] }
    | { type: "deleteFolder"; folder: FolderItem }
  >(null);
  const uploadOpen = searchParams.get("importer") === "1";

  // Paramètres d'URL = source de vérité des filtres (partageables, bouton retour).
  // Paramètres « voulus », mis à jour immédiatement à chaque action : une navigation encore
  // en cours ne doit pas être écrasée par une recherche différée (réseau lent).
  const paramsRef = useRef(new URLSearchParams(searchParams.toString()));
  useEffect(() => {
    paramsRef.current = new URLSearchParams(searchParams.toString());
  }, [searchParams]);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(paramsRef.current);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (!("limite" in patch)) next.delete("limite");
    paramsRef.current = next;
    startTransition(() =>
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }),
    );
  };

  // Recherche avec délai (évite une requête par frappe sur réseau lent).
  useEffect(() => {
    if ((filters.q ?? "") === query) return;
    const id = setTimeout(() => setParams({ q: query || null }), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const selectedIds = [...selected];
  const allSelected = documents.length > 0 && documents.every((d) => selected.has(d.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = (action: () => Promise<{ ok: boolean }>, success: string, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        setSelected(new Set());
        after?.();
        router.refresh();
      } else toast.error(t("toasts.error"));
    });

  const download = async (id: string, which: "pdf" | "original") => {
    const result = await getDocumentFileUrl(id, which, true);
    if (result.ok) window.location.href = result.url;
    else toast.error(t("toasts.error"));
  };

  const hasFilters = Boolean(filters.q || filters.status || filters.period || filters.tag);
  const currentFolder = folders.find((f) => f.id === filters.folder);

  return (
    <>
      <PageHeader
        title={filters.trash ? t("trash") : (currentFolder?.name ?? t("title"))}
        description={filters.trash ? t("trashHint") : t("subtitle")}
        actions={
          !filters.trash && !readOnly ? (
            <Button onClick={() => setParams({ importer: "1" })}>
              <Upload /> {t("import")}
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Dossiers : barre latérale (bureau), puces défilantes (mobile) */}
        <nav
          aria-label={t("folders")}
          className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0"
        >
          <ul className="flex gap-2 lg:flex-col lg:gap-1">
            <FolderLink
              active={!filters.folder && !filters.trash}
              onClick={() => setParams({ dossier: null, vue: null })}
              icon={Inbox}
            >
              {t("all")}
            </FolderLink>
            {folders.map((folder) => (
              <FolderLink
                key={folder.id}
                active={filters.folder === folder.id}
                onClick={() => setParams({ dossier: folder.id, vue: null })}
                icon={Folder}
                menu={
                  <DropdownMenuItem
                    destructive
                    onSelect={() => setDialog({ type: "deleteFolder", folder })}
                  >
                    <Trash2 /> {t("deleteFolder")}
                  </DropdownMenuItem>
                }
              >
                {folder.name}
              </FolderLink>
            ))}
            <FolderLink
              active={filters.trash}
              onClick={() => setParams({ vue: "corbeille", dossier: null })}
              icon={Trash2}
            >
              {t("trash")}
            </FolderLink>
            <li className="shrink-0 lg:mt-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground"
                onClick={() => setDialog({ type: "folder" })}
              >
                <FolderPlus /> {t("newFolder")}
              </Button>
            </li>
          </ul>
        </nav>

        <div className="min-w-0 space-y-4">
          {/* Recherche, filtres, affichage */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto">
              <FilterSelect
                label={t("filters.status")}
                value={filters.status ?? ""}
                onChange={(v) => setParams({ statut: v || null })}
                options={[
                  { value: "", label: t("filters.anyStatus") },
                  { value: "draft", label: "Brouillon" },
                  { value: "pending", label: "En attente" },
                  { value: "signed", label: "Signé" },
                  { value: "declined", label: "Refusé" },
                  { value: "expired", label: "Expiré" },
                ]}
              />
              <FilterSelect
                label={t("filters.period")}
                value={filters.period ?? ""}
                onChange={(v) => setParams({ periode: v || null })}
                options={[
                  { value: "", label: t("filters.anyPeriod") },
                  { value: "7d", label: t("filters.7d") },
                  { value: "30d", label: t("filters.30d") },
                  { value: "year", label: t("filters.year") },
                ]}
              />
              <FilterSelect
                label={t("filters.sort")}
                value={filters.sort}
                onChange={(v) => setParams({ tri: v === "recent" ? null : v })}
                options={[
                  { value: "recent", label: t("filters.recent") },
                  { value: "oldest", label: t("filters.oldest") },
                  { value: "name", label: t("filters.name") },
                ]}
              />
              <div className="flex shrink-0 rounded-xl border border-border bg-secondary p-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("view.grid")}
                  aria-pressed={layout === "grid"}
                  onClick={() => setLayout("grid")}
                  className={cn(layout === "grid" && "bg-background-elevated")}
                >
                  <LayoutGrid />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("view.list")}
                  aria-pressed={layout === "list"}
                  onClick={() => setLayout("list")}
                  className={cn(layout === "list" && "bg-background-elevated")}
                >
                  <List />
                </Button>
              </div>
            </div>
          </div>

          {/* Étiquettes */}
          {tags.length > 0 || !filters.trash ? (
            <div className="flex flex-wrap items-center gap-2">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => setParams({ etiquette: filters.tag === tag.id ? null : tag.id })}
                  aria-pressed={filters.tag === tag.id}
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors",
                    filters.tag === tag.id
                      ? "border-ring bg-accent"
                      : "border-border hover:border-ring/40",
                  )}
                >
                  <span
                    className={cn("size-2 rounded-full", TAG_DOT[tag.color] ?? TAG_DOT.indigo)}
                  />
                  {tag.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDialog({ type: "tag" })}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-xs text-muted-foreground hover:text-foreground"
              >
                <Tag className="size-3.5" /> {t("newTag")}
              </button>
              {hasFilters && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setParams({ q: null, statut: null, periode: null, etiquette: null });
                  }}
                >
                  {t("filters.reset")}
                </Button>
              )}
            </div>
          ) : null}

          {documents.length > 0 && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) =>
                  setSelected(v ? new Set(documents.map((d) => d.id)) : new Set())
                }
                aria-label={t("selectAll")}
              />
              {selected.size > 0 ? t("selected", { count: selected.size }) : t("selectAll")}
            </div>
          )}

          {/* Liste */}
          <div className={cn("transition-opacity", pending && "opacity-60")}>
            {documents.length === 0 ? (
              filters.trash ? (
                <EmptyState
                  icon={Trash2}
                  title={t("empty.trashTitle")}
                  description={t("empty.trashBody")}
                />
              ) : hasFilters ? (
                <EmptyState
                  icon={SearchX}
                  title={t("empty.searchTitle")}
                  description={t("empty.searchBody")}
                />
              ) : (
                <EmptyState
                  icon={Inbox}
                  title={t("empty.title")}
                  description={t("empty.body")}
                  action={
                    !readOnly && (
                      <Button onClick={() => setParams({ importer: "1" })}>
                        <Upload /> {t("import")}
                      </Button>
                    )
                  }
                />
              )
            ) : layout === "grid" ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {documents.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    tags={tags}
                    selected={selected.has(doc.id)}
                    onToggle={() => toggle(doc.id)}
                    menu={<DocumentMenu doc={doc} trash={filters.trash} onAction={handleMenu} />}
                  />
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl glass">
                {documents.map((doc) => (
                  <DocumentListItem
                    key={doc.id}
                    doc={doc}
                    tags={tags}
                    selected={selected.has(doc.id)}
                    onToggle={() => toggle(doc.id)}
                    menu={<DocumentMenu doc={doc} trash={filters.trash} onAction={handleMenu} />}
                  />
                ))}
              </ul>
            )}
          </div>

          {documents.length < total && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                onClick={() => setParams({ limite: String(filters.limit + 30) })}
                loading={pending}
              >
                {t("loadMore")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Barre d'actions groupées */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 lg:bottom-6 lg:pl-64">
          <div className="flex animate-in items-center gap-1 rounded-2xl border border-card-border glass bg-popover p-1.5 shadow-lift fade-in slide-in-from-bottom-4">
            <span className="px-3 text-sm font-medium">
              {t("selected", { count: selected.size })}
            </span>
            {filters.trash ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    run(
                      () => restoreDocuments(selectedIds),
                      t("toasts.restored", { count: selected.size }),
                    )
                  }
                >
                  <RotateCcw /> <span className="hidden sm:inline">{t("actions.restore")}</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setDialog({ type: "delete", ids: selectedIds })}
                >
                  <Trash2 /> <span className="hidden sm:inline">{t("actions.deleteForever")}</span>
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDialog({ type: "move", ids: selectedIds })}
                >
                  <FolderInput /> <span className="hidden sm:inline">{t("actions.move")}</span>
                </Button>
                {tags.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost">
                        <Tag /> <span className="hidden sm:inline">{t("actions.tag")}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" side="top">
                      {tags.map((tag) => {
                        const all = selectedIds.every((id) =>
                          documents.find((d) => d.id === id)?.tagIds.includes(tag.id),
                        );
                        return (
                          <DropdownMenuItem
                            key={tag.id}
                            onSelect={() =>
                              run(() => setTag(selectedIds, tag.id, !all), t("toasts.tagged"))
                            }
                          >
                            <span className={cn("size-2 rounded-full", TAG_DOT[tag.color])} />
                            <span className="flex-1">{tag.name}</span>
                            {all && <Check />}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() =>
                    run(
                      () => trashDocuments(selectedIds),
                      t("toasts.trashed", { count: selected.size }),
                    )
                  }
                >
                  <Trash2 /> <span className="hidden sm:inline">{t("actions.trash")}</span>
                </Button>
              </>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t("clearSelection")}
              onClick={() => setSelected(new Set())}
            >
              <X />
            </Button>
          </div>
        </div>
      )}

      <UploadDialog
        open={uploadOpen}
        folderId={filters.folder && filters.folder !== "aucun" ? filters.folder : null}
        onOpenChange={(open) => setParams({ importer: open ? "1" : null })}
      />

      <NameDialog
        key={dialog?.type === "folder" ? "folder-open" : "folder"}
        open={dialog?.type === "folder"}
        title={t("newFolder")}
        label={t("folderName")}
        onClose={() => setDialog(null)}
        onSubmit={(name) =>
          run(
            () => createFolder(name),
            t("newFolder"),
            () => setDialog(null),
          )
        }
      />
      <NameDialog
        key={dialog?.type === "tag" ? "tag-open" : "tag"}
        open={dialog?.type === "tag"}
        title={t("newTag")}
        label={t("tagName")}
        withColor
        onClose={() => setDialog(null)}
        onSubmit={(name, color) =>
          run(
            () => createTag(name, color ?? "indigo"),
            t("newTag"),
            () => setDialog(null),
          )
        }
      />
      <NameDialog
        key={dialog?.type === "rename" ? dialog.doc.id : "rename"}
        open={dialog?.type === "rename"}
        title={t("actions.rename")}
        label={t("actions.rename")}
        initial={dialog?.type === "rename" ? dialog.doc.title : ""}
        onClose={() => setDialog(null)}
        onSubmit={(title) =>
          dialog?.type === "rename" &&
          run(
            () => renameDocument(dialog.doc.id, title),
            t("toasts.renamed"),
            () => setDialog(null),
          )
        }
      />
      <Dialog open={dialog?.type === "move"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("actions.move")}</DialogTitle>
          </DialogHeader>
          <ul className="space-y-1">
            {[{ id: null as string | null, name: t("noFolder") }, ...folders].map((folder) => (
              <li key={folder.id ?? "none"}>
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-secondary"
                  onClick={() =>
                    dialog?.type === "move" &&
                    run(
                      () => moveDocuments(dialog.ids, folder.id),
                      t("toasts.moved"),
                      () => setDialog(null),
                    )
                  }
                >
                  <Folder className="size-4 text-muted-foreground" /> {folder.name}
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog?.type === "delete"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("actions.deleteForever")}</DialogTitle>
            <DialogDescription>{t("actions.deleteForeverConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Annuler</Button>
            </DialogClose>
            <Button
              variant="destructive"
              loading={pending}
              onClick={() =>
                dialog?.type === "delete" &&
                run(
                  () => deleteDocumentsForever(dialog.ids),
                  t("toasts.deleted"),
                  () => setDialog(null),
                )
              }
            >
              <Trash2 /> {t("actions.deleteForever")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog?.type === "deleteFolder"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteFolder")}</DialogTitle>
            <DialogDescription>{t("deleteFolderConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Annuler</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() =>
                dialog?.type === "deleteFolder" &&
                run(
                  () => deleteFolder(dialog.folder.id),
                  t("deleteFolder"),
                  () => {
                    setDialog(null);
                    setParams({ dossier: null });
                  },
                )
              }
            >
              {t("deleteFolder")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  function handleMenu(action: MenuAction, doc: DocumentRow) {
    switch (action) {
      case "download":
        return void download(doc.id, "pdf");
      case "downloadOriginal":
        return void download(doc.id, "original");
      case "rename":
        return setDialog({ type: "rename", doc });
      case "move":
        return setDialog({ type: "move", ids: [doc.id] });
      case "trash":
        return run(() => trashDocuments([doc.id]), t("toasts.trashed", { count: 1 }));
      case "restore":
        return run(() => restoreDocuments([doc.id]), t("toasts.restored", { count: 1 }));
      case "deleteForever":
        return setDialog({ type: "delete", ids: [doc.id] });
    }
  }
}

type MenuAction =
  "download" | "downloadOriginal" | "rename" | "move" | "trash" | "restore" | "deleteForever";

function DocumentMenu({
  doc,
  trash,
  onAction,
}: {
  doc: DocumentRow;
  trash: boolean;
  onAction: (a: MenuAction, d: DocumentRow) => void;
}) {
  const t = useTranslations("documents.actions");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions — ${doc.title}`}
          className="shrink-0"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="max-w-56 truncate">{doc.title}</DropdownMenuLabel>
        {trash ? (
          <>
            <DropdownMenuItem onSelect={() => onAction("restore", doc)}>
              <RotateCcw /> {t("restore")}
            </DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={() => onAction("deleteForever", doc)}>
              <Trash2 /> {t("deleteForever")}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/app/documents/${doc.id}`}>
                <FileText /> {t("open")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction("download", doc)}>
              <Download /> {t("download")}
            </DropdownMenuItem>
            {doc.originalType !== "pdf" && (
              <DropdownMenuItem onSelect={() => onAction("downloadOriginal", doc)}>
                <Download /> {t("downloadOriginal")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAction("rename", doc)}>
              <Pencil /> {t("rename")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction("move", doc)}>
              <FolderInput /> {t("move")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => onAction("trash", doc)}>
              <Trash2 /> {t("trash")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Date relative (« il y a 5 min ») calculée côté navigateur uniquement : évite un écart
 * d'hydratation entre l'heure du serveur et celle du client. */
function UpdatedAt({ date }: { date: string }) {
  const t = useTranslations("documents");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const isClient = useIsClient();
  const value = new Date(date);
  return (
    <>
      {t("updated", {
        date: isClient
          ? format.relativeTime(value, now)
          : format.dateTime(value, { dateStyle: "medium" }),
      })}
    </>
  );
}

function Thumbnail({ doc, className }: { doc: DocumentRow; className?: string }) {
  return doc.thumbnailUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire, pas d'optimisation d'image
    <img
      src={doc.thumbnailUrl}
      alt=""
      loading="lazy"
      className={cn("object-cover object-top", className)}
    />
  ) : (
    <div className={cn("flex items-center justify-center bg-secondary", className)}>
      <FileText className="size-8 text-muted-foreground/60" aria-hidden />
    </div>
  );
}

function TagDots({ ids, tags }: { ids: string[]; tags: TagItem[] }) {
  const list = tags.filter((t) => ids.includes(t.id));
  if (!list.length) return null;
  return (
    <span className="flex -space-x-0.5" title={list.map((t) => t.name).join(", ")}>
      {list.map((tag) => (
        <span
          key={tag.id}
          className={cn("size-2 rounded-full ring-2 ring-card", TAG_DOT[tag.color])}
        />
      ))}
    </span>
  );
}

function DocumentCard({
  doc,
  tags,
  selected,
  onToggle,
  menu,
}: {
  doc: DocumentRow;
  tags: TagItem[];
  selected: boolean;
  onToggle: () => void;
  menu: React.ReactNode;
}) {
  const t = useTranslations("documents");
  return (
    <li
      className={cn(
        "group relative overflow-hidden rounded-2xl glass transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-lift",
        selected && "border-ring ring-2 ring-ring/30",
      )}
    >
      <div className="relative aspect-[3/4] overflow-hidden border-b border-border bg-white">
        <Thumbnail doc={doc} className="size-full" />
        <div className="absolute top-2 left-2">
          <StatusBadge status={doc.status} className="bg-background/80 backdrop-blur" />
        </div>
      </div>
      <div className="absolute top-2 right-2 z-10">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={t("select", { title: doc.title })}
          className={cn(
            "size-6 bg-background/90 transition-opacity sm:opacity-0 sm:group-hover:opacity-100",
            selected && "sm:opacity-100",
          )}
        />
      </div>
      <div className="flex items-start gap-1 p-3">
        <div className="min-w-0 flex-1">
          {/* Lien « étiré » : toute la carte est cliquable, la case et le menu restent au-dessus. */}
          <Link
            href={`/app/documents/${doc.id}`}
            className="block truncate text-sm font-medium after:absolute after:inset-0 after:content-['']"
            title={doc.title}
          >
            {doc.title}
          </Link>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              <UpdatedAt date={doc.updatedAt} />
            </span>
            <TagDots ids={doc.tagIds} tags={tags} />
          </p>
        </div>
        <div className="relative z-10">{menu}</div>
      </div>
    </li>
  );
}

function DocumentListItem({
  doc,
  tags,
  selected,
  onToggle,
  menu,
}: {
  doc: DocumentRow;
  tags: TagItem[];
  selected: boolean;
  onToggle: () => void;
  menu: React.ReactNode;
}) {
  const t = useTranslations("documents");
  return (
    <li className={cn("flex items-center gap-3 px-3 py-2.5 sm:px-4", selected && "bg-accent")}>
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        aria-label={t("select", { title: doc.title })}
      />
      <Link href={`/app/documents/${doc.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Thumbnail
          doc={doc}
          className="h-12 w-9 shrink-0 rounded-md border border-border bg-white"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{doc.title}</p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {doc.pageCount !== null && <span>{t("pages", { count: doc.pageCount })}</span>}
            <span className="hidden sm:inline">
              · <UpdatedAt date={doc.updatedAt} />
            </span>
            <TagDots ids={doc.tagIds} tags={tags} />
          </p>
        </div>
        <StatusBadge status={doc.status} className="hidden sm:inline-flex" />
      </Link>
      {menu}
    </li>
  );
}

function FolderLink({
  active,
  onClick,
  icon: Icon,
  children,
  menu,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Folder;
  children: React.ReactNode;
  menu?: React.ReactNode;
}) {
  return (
    <li className="group relative shrink-0">
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-xl border px-3 text-sm font-medium whitespace-nowrap transition-colors lg:border-transparent",
          active
            ? "border-ring/40 bg-accent text-foreground"
            : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="truncate lg:max-w-36">{children}</span>
      </button>
      {menu && (
        <div className="absolute top-1/2 right-1 hidden -translate-y-1/2 lg:group-hover:block">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7"
                aria-label="Options du dossier"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>{menu}</DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </li>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 shrink-0 cursor-pointer rounded-xl border border-input bg-background-elevated/60 px-3 text-sm"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const COLORS = ["indigo", "violet", "cyan", "emerald", "amber", "rose", "slate"];

function NameDialog({
  open,
  title,
  label,
  initial = "",
  withColor,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  label: string;
  initial?: string;
  withColor?: boolean;
  onClose: () => void;
  onSubmit: (name: string, color?: string) => void;
}) {
  const [name, setName] = useState(initial);
  const [color, setColor] = useState("indigo");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSubmit(name.trim(), withColor ? color : undefined);
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={label}
            placeholder={label}
            maxLength={120}
          />
          {withColor && (
            <div role="radiogroup" aria-label="Couleur" className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-8 cursor-pointer rounded-full ring-offset-2 ring-offset-popover",
                    TAG_DOT[c],
                    color === c && "ring-2 ring-ring",
                  )}
                />
              ))}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {title}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
