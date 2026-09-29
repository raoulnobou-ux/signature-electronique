"use client";

import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  FileArchive,
  Loader2,
  PenLine,
  Quote,
  Stamp,
  Trash2,
  Type,
  UserRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  finalizeSignature,
  type FinalizeResult,
} from "@/app/(app)/app/documents/[id]/signer/actions";
import type { AssetType, SignatureAsset } from "@/app/(app)/app/signatures/actions";
import { PdfViewer, type PageSize } from "@/components/documents/pdf-viewer";
import { PageLayer } from "@/components/editor/page-layer";
import {
  defaultSize,
  newFieldId,
  useEditorState,
  type EditorField,
} from "@/components/editor/state";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { isImageField, MENTIONS, type FieldType } from "@/lib/pdf/fields";
import { cn } from "@/lib/utils";

type Doc = { id: string; title: string; pageCount: number };
type Outcome = {
  status: "waiting" | "signing" | "done" | "error";
  result?: Extract<FinalizeResult, { ok: true }>;
};

const TOOLS: { type: FieldType; icon: LucideIcon }[] = [
  { type: "signature", icon: PenLine },
  { type: "initials", icon: Type },
  { type: "stamp", icon: Stamp },
  { type: "date", icon: CalendarDays },
  { type: "name", icon: UserRound },
  { type: "mention", icon: Quote },
];

/**
 * Signature en lot : un seul placement sur le premier document, appliqué à tous
 * (même position relative ; « dernière page » suit la longueur de chaque document).
 * Chaque document passe par la même finalisation serveur que la signature unitaire.
 */
export function BulkSigner({
  documents,
  pdfUrl,
  assets,
  defaults,
  stampsAllowed,
}: {
  documents: Doc[];
  pdfUrl: string;
  assets: SignatureAsset[];
  defaults: { name: string; dateLabel: string };
  stampsAllowed: boolean;
}) {
  const t = useTranslations("documents.bulk");
  const tTools = useTranslations("editor.tools");
  const editor = useEditorState<EditorField>([]);
  const { fields, update, select, selected } = editor;
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [armed, setArmed] = useState<FieldType | null>(null);
  const [lastPage, setLastPage] = useState(true);
  const [footer, setFooter] = useState(true);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [running, setRunning] = useState(false);
  const [zipping, setZipping] = useState(false);

  const assetUrls = useMemo(() => Object.fromEntries(assets.map((a) => [a.id, a.url])), [assets]);
  const defaultAsset = (type: AssetType) =>
    assets.find((a) => a.type === type && a.isDefault) ??
    assets.find((a) => a.type === type) ??
    null;
  const firstLast = documents[0]!.pageCount - 1;
  const started = Object.keys(outcomes).length > 0;
  const done = documents.filter((d) => outcomes[d.id]?.status === "done");

  const place = (page: number, x: number, y: number) => {
    if (!armed) return;
    const size = sizes[page];
    if (!size) return;
    const asset = isImageField(armed) ? defaultAsset(armed as AssetType) : null;
    const { w, h } = defaultSize(
      armed,
      size.width / size.height,
      asset?.width && asset.height ? asset.width / asset.height : undefined,
    );
    const field: EditorField = {
      id: newFieldId(),
      page,
      w,
      h,
      x: Math.min(Math.max(0, x - w / 2), 100 - w),
      y: Math.min(Math.max(0, y - h / 2), 100 - h),
      rotation: 0,
      opacity: 1,
      type: armed,
      assetId: asset?.id ?? null,
      value:
        armed === "date"
          ? defaults.dateLabel
          : armed === "name"
            ? defaults.name
            : armed === "mention"
              ? MENTIONS[0]!
              : null,
    };
    update([...fields, field]);
    select(field.id);
    setArmed(null);
  };

  const signAll = async () => {
    setRunning(true);
    setOutcomes(Object.fromEntries(documents.map((d) => [d.id, { status: "waiting" } as Outcome])));
    for (const doc of documents) {
      setOutcomes((o) => ({ ...o, [doc.id]: { status: "signing" } }));
      const mapped = fields.map((f) => ({
        ...f,
        page:
          lastPage && f.page === firstLast
            ? doc.pageCount - 1
            : Math.min(f.page, doc.pageCount - 1),
      }));
      try {
        const result = await finalizeSignature(doc.id, mapped, { timestampFooter: footer });
        setOutcomes((o) => ({
          ...o,
          [doc.id]: result.ok ? { status: "done", result } : { status: "error" },
        }));
      } catch {
        setOutcomes((o) => ({ ...o, [doc.id]: { status: "error" } }));
      }
    }
    setRunning(false);
  };

  const downloadZip = async () => {
    setZipping(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const names = new Set<string>();
      for (const doc of done) {
        const result = outcomes[doc.id]!.result!;
        const blob = await (await fetch(result.downloadUrl)).blob();
        let name = result.fileName;
        for (let i = 2; names.has(name); i++)
          name = result.fileName.replace(/\.pdf$/, ` (${i}).pdf`);
        names.add(name);
        zip.file(name, blob);
      }
      const archive = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(archive);
      const a = document.createElement("a");
      a.href = url;
      a.download = t("zipName");
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error(t("zipError"));
    } finally {
      setZipping(false);
    }
  };

  const renderOverlay = (pageIndex: number, size: PageSize) => (
    <PageLayer
      pageIndex={pageIndex}
      size={size}
      fields={fields}
      selectedId={editor.selectedId}
      assetUrls={assetUrls}
      armed={armed !== null}
      onPlace={place}
      onSelect={select}
      onChange={(field, isDone, original) => {
        update(
          fields.map((f) => (f.id === field.id ? field : f)),
          false,
        );
        if (isDone && original)
          editor.commitFrom(fields.map((f) => (f.id === original.id ? original : f)));
      }}
    />
  );

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b border-border bg-background/90 px-3 py-2 sm:px-4">
        <Button asChild variant="ghost" size="icon-sm" aria-label={t("back")}>
          <Link href="/app/documents">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {t("title", { count: documents.length })}
          </p>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
        </div>
        {!started && (
          <Button size="sm" disabled={fields.length === 0} onClick={() => void signAll()}>
            <PenLine /> {t("signAll", { count: documents.length })}
          </Button>
        )}
      </header>

      {started ? (
        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="mx-auto max-w-2xl space-y-6">
            <div className="space-y-2">
              <h1 className="font-display text-2xl font-semibold">
                {running ? t("signing") : t("finished", { count: done.length })}
              </h1>
              <Progress
                value={
                  (documents.filter((d) => ["done", "error"].includes(outcomes[d.id]?.status ?? ""))
                    .length /
                    documents.length) *
                  100
                }
              />
            </div>
            <ul className="space-y-2" data-testid="bulk-results">
              {documents.map((doc) => {
                const status = outcomes[doc.id]?.status ?? "waiting";
                return (
                  <li
                    key={doc.id}
                    data-status={status}
                    className="flex items-center gap-3 rounded-2xl border border-border p-3 text-sm"
                  >
                    {status === "done" ? (
                      <CheckCircle2 className="size-5 text-success" aria-hidden />
                    ) : status === "error" ? (
                      <XCircle className="size-5 text-destructive" aria-hidden />
                    ) : status === "signing" ? (
                      <Loader2 className="size-5 animate-spin text-brand-violet" aria-hidden />
                    ) : (
                      <span className="size-5 rounded-full border-2 border-border" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                    <span className="text-xs text-muted-foreground">{t(`status.${status}`)}</span>
                  </li>
                );
              })}
            </ul>
            {!running && done.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void downloadZip()} loading={zipping}>
                  <FileArchive /> {t("zip")}
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/app/documents">{t("backToDocuments")}</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside className="flex shrink-0 flex-col gap-3 overflow-x-auto border-b border-border p-3 lg:w-64 lg:overflow-y-auto lg:border-r lg:border-b-0">
            <div className="flex gap-1 lg:flex-col">
              {TOOLS.map(({ type, icon: Icon }) => {
                const missing = isImageField(type) && !defaultAsset(type as AssetType);
                const locked = type === "stamp" && !stampsAllowed;
                return (
                  <button
                    key={type}
                    type="button"
                    disabled={missing || locked}
                    aria-pressed={armed === type}
                    title={missing ? t("missingAsset") : undefined}
                    onClick={() => {
                      setArmed((a) => (a === type ? null : type));
                      select(null);
                    }}
                    className={cn(
                      "flex shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40",
                      armed === type
                        ? "bg-brand-gradient text-white"
                        : "text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    <Icon className="size-4" aria-hidden /> {tTools(type)}
                  </button>
                );
              })}
            </div>
            {!defaultAsset("signature") && (
              <Link href="/app/signatures" className="text-xs text-accent-foreground underline">
                {t("createSignature")}
              </Link>
            )}
            <label className="flex items-start justify-between gap-3 text-sm">
              <span>
                {t("lastPage")}
                <span className="block text-xs text-muted-foreground">{t("lastPageHint")}</span>
              </span>
              <Switch checked={lastPage} onCheckedChange={setLastPage} />
            </label>
            <label className="flex items-start justify-between gap-3 text-sm">
              {t("footer")}
              <Switch checked={footer} onCheckedChange={setFooter} />
            </label>
            {selected && (
              <Button
                variant="ghost"
                size="sm"
                className="justify-start text-destructive"
                onClick={() => {
                  update(fields.filter((f) => f.id !== selected.id));
                  select(null);
                }}
              >
                <Trash2 /> {t("removeField")}
              </Button>
            )}
            <ol className="hidden space-y-1 text-xs text-muted-foreground lg:block">
              {documents.map((d, i) => (
                <li key={d.id} className="truncate">
                  {i + 1}. {d.title}
                </li>
              ))}
            </ol>
          </aside>
          <div className="relative min-h-0 min-w-0 flex-1">
            {armed && (
              <div className="absolute inset-x-0 top-12 z-20 flex justify-center px-3">
                <div className="rounded-full glass bg-popover px-4 py-1.5 text-sm shadow-lift">
                  {t("placeHint", { tool: tTools(armed) })}
                </div>
              </div>
            )}
            <PdfViewer
              source={pdfUrl}
              className="h-full"
              maxPageWidth={900}
              renderOverlay={renderOverlay}
              onLoaded={({ sizes: s }) => setSizes(s)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
