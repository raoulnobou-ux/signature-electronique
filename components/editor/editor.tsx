"use client";

import {
  ArrowLeft,
  CalendarDays,
  CheckSquare,
  Cloud,
  CloudOff,
  Copy,
  Download,
  FileCheck2,
  Layers,
  Mail,
  MessageCircle,
  PenLine,
  Printer,
  Quote,
  Redo2,
  Share2,
  Stamp,
  Trash2,
  Type,
  Undo2,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { finalizeSignature, saveDraft, type FinalizeResult } from "@/app/(app)/app/documents/[id]/signer/actions";
import type { AssetType, SignatureAsset } from "@/app/(app)/app/signatures/actions";
import { PdfViewer, type PageSize } from "@/components/documents/pdf-viewer";
import { SignatureCreator } from "@/components/signatures/signature-creator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { isImageField, MENTIONS, type FieldType } from "@/lib/pdf/fields";
import { cn } from "@/lib/utils";
import { Confetti } from "./confetti";
import { PageLayer } from "./page-layer";
import { defaultSize, newFieldId, useEditorState, type EditorField } from "./state";

type Props = {
  document: { id: string; title: string; pageCount: number };
  pdfUrl: string;
  initialFields: EditorField[];
  assets: SignatureAsset[];
  defaults: { name: string; dateLabel: string };
  stampsAllowed: boolean;
};

const TOOLS: { type: FieldType; icon: LucideIcon }[] = [
  { type: "signature", icon: PenLine },
  { type: "initials", icon: Type },
  { type: "stamp", icon: Stamp },
  { type: "date", icon: CalendarDays },
  { type: "name", icon: UserRound },
  { type: "mention", icon: Quote },
  { type: "text", icon: Type },
  { type: "checkbox", icon: CheckSquare },
];

type SaveState = "idle" | "saving" | "saved" | "error";

export function Editor({ document: doc, pdfUrl, initialFields, assets: initialAssets, defaults, stampsAllowed }: Props) {
  const t = useTranslations("editor");
  const editor = useEditorState(initialFields);
  const { fields, selected, update, select } = editor;
  const [assets, setAssets] = useState(initialAssets);
  const [armed, setArmed] = useState<FieldType | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [creatorFor, setCreatorFor] = useState<AssetType | null>(null);
  const [lastSave, setLastSave] = useState({ revision: 0, ok: true });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [footer, setFooter] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [result, setResult] = useState<Extract<FinalizeResult, { ok: true }> | null>(null);

  const assetUrls = useMemo(() => Object.fromEntries(assets.map((a) => [a.id, a.url])), [assets]);
  const defaultAsset = useCallback(
    (type: AssetType) => assets.find((a) => a.type === type && a.isDefault) ?? assets.find((a) => a.type === type) ?? null,
    [assets],
  );

  // ----- Enregistrement automatique du brouillon -----
  useEffect(() => {
    if (editor.revision === 0) return;
    const revision = editor.revision;
    const id = setTimeout(async () => {
      const response = await saveDraft(doc.id, fields);
      setLastSave({ revision, ok: response.ok });
    }, 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- déclenché par la révision
  }, [editor.revision]);
  const saveState: SaveState =
    editor.revision === 0 ? "idle" : lastSave.revision !== editor.revision ? "saving" : lastSave.ok ? "saved" : "error";

  // ----- Placement -----
  const createField = useCallback(
    (type: FieldType, page: number, centerX: number, centerY: number, asset?: SignatureAsset | null): EditorField | null => {
      const size = sizes[page];
      if (!size) return null;
      const pageAspect = size.width / size.height;
      const assetAspect = asset?.width && asset?.height ? asset.width / asset.height : undefined;
      const { w, h } = defaultSize(type, pageAspect, assetAspect);
      const value =
        type === "date" ? defaults.dateLabel : type === "name" ? defaults.name : type === "mention" ? MENTIONS[0]! : type === "text" ? "Texte" : type === "checkbox" ? "true" : null;
      return {
        id: newFieldId(),
        page,
        w,
        h,
        x: Math.min(Math.max(0, centerX - w / 2), 100 - w),
        y: Math.min(Math.max(0, centerY - h / 2), 100 - h),
        rotation: 0,
        opacity: 1,
        type,
        assetId: asset?.id ?? null,
        value,
      };
    },
    [sizes, defaults],
  );

  const armTool = (type: FieldType) => {
    if (isImageField(type)) {
      if (type === "stamp" && !stampsAllowed) return toast.error(t("errors.feature_not_in_plan"));
      if (!defaultAsset(type as AssetType)) {
        toast.message(t(`needAsset.${type as AssetType}`));
        setCreatorFor(type as AssetType);
        return;
      }
    }
    setArmed((current) => (current === type ? null : type));
    select(null);
  };

  const place = (page: number, x: number, y: number) => {
    if (!armed) return;
    const asset = isImageField(armed) ? defaultAsset(armed as AssetType) : null;
    const field = createField(armed, page, x, y, asset);
    if (!field) return;
    update([...fields, field]);
    select(field.id);
    setArmed(null);
  };

  const patchSelected = (patch: Partial<EditorField>, commit = true) => {
    if (!selected) return;
    update(
      fields.map((f) => (f.id === selected.id ? { ...f, ...patch } : f)),
      commit,
    );
  };

  const removeSelected = useCallback(() => {
    if (!selected) return;
    update(fields.filter((f) => f.id !== selected.id));
    select(null);
  }, [fields, selected, update, select]);

  const repeatOnAllPages = () => {
    if (!selected) return;
    const copies = sizes
      .map((_, page) => page)
      .filter((page) => page !== selected.page && !fields.some((f) => f.page === page && f.type === selected.type && Math.abs(f.x - selected.x) < 0.5 && Math.abs(f.y - selected.y) < 0.5))
      .map((page) => ({ ...selected, id: newFieldId(), page, y: Math.min(selected.y, 100 - selected.h) }));
    update([...fields, ...copies]);
    toast.success(t("properties.repeated", { count: copies.length }));
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const copy = { ...selected, id: newFieldId(), x: Math.min(selected.x + 2, 100 - selected.w), y: Math.min(selected.y + 2, 100 - selected.h) };
    update([...fields, copy]);
    select(copy.id);
  };

  // ----- Raccourcis clavier -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName);
      if (typing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        editor.redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "Escape") {
        setArmed(null);
        select(null);
      } else if (selected && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 2 : 0.25;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        patchSelected({
          x: Math.min(Math.max(0, selected.x + dx), 100 - selected.w),
          y: Math.min(Math.max(0, selected.y + dy), 100 - selected.h),
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ----- Finalisation -----
  const finalize = async () => {
    setFinalizing(true);
    try {
      const response = await finalizeSignature(doc.id, fields, { timestampFooter: footer });
      if (!response.ok) {
        const known = ["no_fields", "read_only", "quota_exceeded", "feature_not_in_plan", "email_unverified", "asset_not_found"];
        toast.error(t(`errors.${known.includes(response.error) ? response.error : "generic"}` as "errors.generic"));
        return;
      }
      setConfirmOpen(false);
      setResult(response);
    } finally {
      setFinalizing(false);
    }
  };

  const pagesWithFields = new Set(fields.map((f) => f.page)).size;

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
      onChange={(field, done, original) => {
        const next = fields.map((f) => (f.id === field.id ? field : f));
        update(next, false);
        // Au relâchement : une seule entrée d'historique pour tout le geste.
        if (done && original) editor.commitFrom(fields.map((f) => (f.id === original.id ? original : f)));
      }}
    />
  );

  if (result) return <SuccessScreen doc={doc} result={result} />;

  return (
    <div className="flex h-dvh flex-col">
      {/* Barre supérieure */}
      <header className="flex items-center gap-2 border-b border-border bg-background/90 px-3 py-2 sm:px-4 md:backdrop-blur">
        <Button asChild variant="ghost" size="icon-sm" aria-label={t("back")}>
          <Link href={`/app/documents/${doc.id}`}>
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{doc.title}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            {saveState === "error" ? <CloudOff className="size-3.5 text-warning" /> : <Cloud className="size-3.5" />}
            {saveState === "saving" ? t("saving") : saveState === "saved" ? t("saved") : saveState === "error" ? t("saveFailed") : t("fieldCount", { count: fields.length })}
          </p>
        </div>
        <Tooltip label={t("undo")}>
          <Button variant="ghost" size="icon-sm" aria-label={t("undo")} disabled={!editor.canUndo} onClick={editor.undo}>
            <Undo2 />
          </Button>
        </Tooltip>
        <Tooltip label={t("redo")}>
          <Button variant="ghost" size="icon-sm" aria-label={t("redo")} disabled={!editor.canRedo} onClick={editor.redo}>
            <Redo2 />
          </Button>
        </Tooltip>
        <Button size="sm" className="ml-1" aria-label={t("finalize")} disabled={fields.length === 0} onClick={() => setConfirmOpen(true)}>
          <FileCheck2 /> <span className="hidden sm:inline">{t("finalize")}</span>
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Outils (bureau) */}
        <aside className="hidden w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-3 lg:flex">
          <p className="px-2 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("tools.title")}</p>
          {TOOLS.map(({ type, icon: Icon }) => (
            <ToolButton key={type} type={type} icon={Icon} active={armed === type} locked={type === "stamp" && !stampsAllowed} onClick={() => armTool(type)} />
          ))}
        </aside>

        {/* Document */}
        <div className="relative min-w-0 flex-1">
          {armed && (
            <div className="absolute inset-x-0 top-12 z-20 flex justify-center px-3">
              <div className="glass flex animate-in items-center gap-3 rounded-full bg-popover py-1.5 pr-1.5 pl-4 text-sm shadow-lift fade-in slide-in-from-top-2">
                {t("placeHint", { tool: t(`tools.${armed}`) })}
                <Button size="sm" variant="ghost" onClick={() => setArmed(null)}>
                  {t("cancelPlace")}
                </Button>
              </div>
            </div>
          )}
          <PdfViewer
            source={pdfUrl}
            className="h-full"
            maxPageWidth={900}
            renderOverlay={renderOverlay}
            onLoaded={({ sizes: loaded }) => setSizes(loaded)}
          />
        </div>

        {/* Propriétés (bureau) */}
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-border p-4 xl:block">
          {selected ? (
            <Properties
              field={selected}
              assets={assets}
              onPatch={patchSelected}
              onDelete={removeSelected}
              onDuplicate={duplicateSelected}
              onRepeat={repeatOnAllPages}
              pageCount={sizes.length}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          )}
        </aside>
      </div>

      {/* Mobile / tablette : propriétés en feuille basse + barre d'outils */}
      {selected && (
        <div className="border-t border-border bg-popover p-4 shadow-lift xl:hidden">
          <Properties
            compact
            field={selected}
            assets={assets}
            onPatch={patchSelected}
            onDelete={removeSelected}
            onDuplicate={duplicateSelected}
            onRepeat={repeatOnAllPages}
            onClose={() => select(null)}
            pageCount={sizes.length}
          />
        </div>
      )}
      <nav aria-label={t("tools.title")} className="flex gap-1 overflow-x-auto border-t border-border bg-background px-2 py-2 pb-safe lg:hidden">
        {TOOLS.map(({ type, icon: Icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => armTool(type)}
            aria-pressed={armed === type}
            className={cn(
              "flex min-w-16 shrink-0 cursor-pointer flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium",
              armed === type ? "bg-brand-gradient text-white" : "text-muted-foreground",
              type === "stamp" && !stampsAllowed && "opacity-40",
            )}
          >
            <Icon className="size-5" aria-hidden />
            {t(`tools.${type}`)}
          </button>
        ))}
      </nav>

      <SignatureCreator
        open={creatorFor !== null}
        type={creatorFor ?? "signature"}
        allowTypeChange={false}
        stampsAllowed={stampsAllowed}
        onOpenChange={(open) => !open && setCreatorFor(null)}
        onCreated={(asset) => {
          setAssets((all) => [...all, { ...asset, isDefault: !all.some((a) => a.type === asset.type) || asset.isDefault }]);
          setArmed(asset.type);
        }}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirm.title")}</DialogTitle>
            <DialogDescription>{t("confirm.body")}</DialogDescription>
          </DialogHeader>
          <p className="text-sm">{t("confirm.fields", { count: fields.length, pages: pagesWithFields })}</p>
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
            <div>
              <label htmlFor="footer-switch" className="text-sm font-medium">
                {t("confirm.footer")}
              </label>
              <p className="text-xs text-muted-foreground">{t("confirm.footerHint")}</p>
            </div>
            <Switch id="footer-switch" checked={footer} onCheckedChange={setFooter} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Annuler</Button>
            </DialogClose>
            <Button onClick={() => void finalize()} loading={finalizing}>
              <FileCheck2 /> {t("confirm.cta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolButton({ type, icon: Icon, active, locked, onClick }: { type: FieldType; icon: LucideIcon; active: boolean; locked: boolean; onClick: () => void }) {
  const t = useTranslations("editor.tools");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
        active ? "bg-brand-gradient text-white shadow-soft" : "hover:bg-secondary",
        locked && "opacity-50",
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
      <span className="flex-1 text-left">{t(type)}</span>
      {locked && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">Pro</Badge>}
    </button>
  );
}

function Properties({
  field,
  assets,
  onPatch,
  onDelete,
  onDuplicate,
  onRepeat,
  onClose,
  pageCount,
  compact,
}: {
  field: EditorField;
  assets: SignatureAsset[];
  onPatch: (patch: Partial<EditorField>, commit?: boolean) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRepeat: () => void;
  onClose?: () => void;
  pageCount: number;
  compact?: boolean;
}) {
  const t = useTranslations("editor");
  const sameType = assets.filter((a) => a.type === field.type);

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          {t(`tools.${field.type}`)} <span className="font-normal text-muted-foreground">· p. {field.page + 1}</span>
        </p>
        {onClose && (
          <Button variant="ghost" size="icon-sm" aria-label={t("properties.close")} onClick={onClose}>
            <X />
          </Button>
        )}
      </div>

      {(field.type === "text" || field.type === "date" || field.type === "name") && (
        <Input
          aria-label={t("properties.text")}
          value={field.value ?? ""}
          maxLength={200}
          onChange={(e) => onPatch({ value: e.target.value }, false)}
          onBlur={() => onPatch({}, true)}
        />
      )}
      {field.type === "mention" && (
        <select
          aria-label={t("properties.mention")}
          value={field.value ?? MENTIONS[0]}
          onChange={(e) => onPatch({ value: e.target.value })}
          className="h-11 w-full rounded-xl border border-input bg-background-elevated/60 px-3 text-sm"
        >
          {MENTIONS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      )}
      {field.type === "checkbox" && (
        <label className="flex items-center justify-between text-sm">
          {t("properties.checked")}
          <Switch checked={field.value === "true"} onCheckedChange={(v) => onPatch({ value: v ? "true" : "false" })} />
        </label>
      )}
      {isImageField(field.type) && sameType.length > 1 && (
        <div className="flex gap-2 overflow-x-auto" role="radiogroup" aria-label={t("properties.asset")}>
          {sameType.map((asset) => (
            <button
              key={asset.id}
              type="button"
              role="radio"
              aria-checked={field.assetId === asset.id}
              onClick={() => {
                // Même largeur ; hauteur ajustée aux proportions de la nouvelle image.
                const current = sameType.find((a) => a.id === field.assetId);
                const oldAspect = current?.width && current.height ? current.width / current.height : 1;
                const newAspect = asset.width && asset.height ? asset.width / asset.height : oldAspect;
                onPatch({ assetId: asset.id, h: Math.min(100 - field.y, (field.h * oldAspect) / newAspect) });
              }}
              className={cn(
                "flex h-14 w-24 shrink-0 cursor-pointer items-center justify-center rounded-xl border bg-white p-1.5",
                field.assetId === asset.id ? "border-brand-violet ring-2 ring-ring/30" : "border-border",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- URL signée */}
              <img src={asset.url} alt={asset.name} className="max-h-full max-w-full object-contain" />
            </button>
          ))}
        </div>
      )}

      <div className={cn("grid gap-3", compact ? "grid-cols-2" : "grid-cols-1")}>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("properties.opacity")} · {Math.round(field.opacity * 100)} %
          <input
            type="range"
            min={0.3}
            max={1}
            step={0.05}
            value={field.opacity}
            onChange={(e) => onPatch({ opacity: Number(e.target.value) }, false)}
            onPointerUp={() => onPatch({}, true)}
            className="w-full accent-brand-violet"
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t("properties.rotation")} · {field.rotation}°
          <input
            type="range"
            min={-15}
            max={15}
            step={1}
            value={field.rotation}
            onChange={(e) => onPatch({ rotation: Number(e.target.value) }, false)}
            onPointerUp={() => onPatch({}, true)}
            className="w-full accent-brand-violet"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {pageCount > 1 && (
          <Button variant="secondary" size="sm" onClick={onRepeat}>
            <Layers /> {t("properties.repeat")}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onDuplicate}>
          <Copy /> {t("properties.duplicate")}
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
          <Trash2 /> {t("properties.delete")}
        </Button>
      </div>
    </div>
  );
}

/** Écran de succès : confettis, téléchargement, impression, partage WhatsApp / e-mail. */
function SuccessScreen({ doc, result }: { doc: Props["document"]; result: Extract<FinalizeResult, { ok: true }> }) {
  const t = useTranslations("editor.success");
  const [busy, setBusy] = useState<string | null>(null);

  const fetchFile = async () => {
    const response = await fetch(result.downloadUrl);
    const blob = await response.blob();
    return new File([blob], result.fileName, { type: "application/pdf" });
  };

  const print = async () => {
    setBusy("print");
    try {
      const url = URL.createObjectURL(await fetchFile());
      const frame = document.createElement("iframe");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      frame.src = url;
      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        } catch {
          window.open(url, "_blank");
        }
      };
      document.body.append(frame);
    } finally {
      setBusy(null);
    }
  };

  const share = async (channel: "native" | "whatsapp" | "email") => {
    const text = t("shareText", { title: doc.title });
    if (channel === "native" || channel === "whatsapp") {
      try {
        setBusy(channel);
        const file = await fetchFile();
        // Sur téléphone : envoi direct du PDF dans WhatsApp (ou autre) via le partage natif.
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: doc.title, text });
          return;
        }
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
      } finally {
        setBusy(null);
      }
      if (channel === "whatsapp") window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      return;
    }
    window.location.href = `mailto:?subject=${encodeURIComponent(t("emailSubject", { title: doc.title }))}&body=${encodeURIComponent(text)}`;
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <Confetti />
      <div className="relative w-full max-w-lg animate-in space-y-6 text-center fade-in zoom-in-95 duration-500">
        <div className="relative mx-auto flex size-20 items-center justify-center">
          <div className="absolute -inset-8 bg-[radial-gradient(closest-side,rgb(52_211_153/0.35),transparent)]" />
          <div className="relative flex size-16 items-center justify-center rounded-2xl bg-success text-white shadow-lift">
            <FileCheck2 className="size-8" aria-hidden />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("body")}</p>
        </div>
        <div className="glass rounded-2xl p-4 text-left">
          <p className="mb-1 text-xs text-muted-foreground">{t("fingerprint")}</p>
          <code className="block font-mono text-[11px] break-all">{result.sha256}</code>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button asChild size="lg" className="col-span-2">
            <a href={result.downloadUrl} download={result.fileName}>
              <Download /> {t("download")}
            </a>
          </Button>
          <Button variant="secondary" size="lg" loading={busy === "print"} onClick={() => void print()}>
            <Printer /> {t("print")}
          </Button>
          <Button variant="secondary" size="lg" loading={busy === "whatsapp"} onClick={() => void share("whatsapp")}>
            <MessageCircle /> {t("whatsapp")}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => void share("email")}>
            <Mail /> {t("email")}
          </Button>
          <Button variant="secondary" size="lg" loading={busy === "native"} onClick={() => void share("native")}>
            <Share2 /> {t("share")}
          </Button>
        </div>
        <Button asChild variant="link">
          <Link href={`/app/documents/${doc.id}`}>{t("view")}</Link>
        </Button>
      </div>
    </div>
  );
}
