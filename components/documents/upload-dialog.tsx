"use client";

import {
  AlertCircle,
  Camera,
  CheckCircle2,
  FileText,
  Link2,
  RotateCcw,
  Upload,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_MB } from "@/lib/documents/limits";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Scanner } from "./scanner";
import { useUploadQueue, type UploadItem } from "./use-upload-queue";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId?: string | null;
};

export function UploadDialog({ open, onOpenChange, folderId = null }: Props) {
  const t = useTranslations("documents.upload");
  const tScan = useTranslations("documents.scanner");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [view, setView] = useState<"pick" | "scan" | "link">("pick");
  const [url, setUrl] = useState("");
  const { items, enqueue, retry, reset, busy } = useUploadQueue(folderId);

  const done = items.filter((i) => i.stage === "done");
  const allFinished = items.length > 0 && !busy;

  const close = (next: boolean) => {
    if (!next) {
      if (done.length) router.refresh();
      if (!busy) {
        reset();
        setView("pick");
      }
    }
    onOpenChange(next);
  };

  const addFiles = (files: FileList | File[] | null) => {
    if (!files?.length) return;
    enqueue([...files].map((file) => ({ type: "file" as const, file })));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{view === "scan" ? tScan("title") : t("title")}</DialogTitle>
          <DialogDescription>
            {view === "scan" ? tScan("description") : t("description", { max: MAX_UPLOAD_MB })}
          </DialogDescription>
        </DialogHeader>

        {view === "scan" ? (
          <Scanner
            onCancel={() => setView("pick")}
            onDone={(file) => {
              setView("pick");
              enqueue([{ type: "file", file }]);
            }}
          />
        ) : (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              className={cn(
                "relative flex flex-col items-center gap-4 overflow-hidden rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-all duration-300",
                dragActive
                  ? "scale-[1.01] border-brand-violet bg-accent shadow-[0_0_40px_-10px_var(--brand-violet)]"
                  : "border-border bg-secondary/40",
              )}
            >
              <div className="relative">
                <div className="absolute -inset-6 bg-[radial-gradient(closest-side,rgb(129_140_248/0.35),transparent)]" />
                <div
                  className={cn(
                    "relative flex size-16 items-center justify-center rounded-2xl bg-brand-gradient text-white transition-transform duration-300",
                    dragActive && "-translate-y-1 scale-110",
                  )}
                >
                  <UploadCloud className="size-7" aria-hidden />
                </div>
              </div>
              <div>
                <p className="font-display text-lg font-semibold">
                  {dragActive ? t("dropActive") : t("drop")}
                </p>
                <p className="text-sm text-muted-foreground">{t("or")}</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ACCEPT_ATTRIBUTE}
                className="hidden"
                data-testid="upload-input"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button onClick={() => inputRef.current?.click()}>
                  <Upload /> {t("browse")}
                </Button>
                <Button variant="secondary" onClick={() => setView("scan")}>
                  <Camera /> {t("camera")}
                </Button>
              </div>
            </div>

            {view === "link" ? (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!url.trim()) return;
                  enqueue([{ type: "url", url: url.trim() }]);
                  setUrl("");
                  setView("pick");
                }}
              >
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    type="url"
                    inputMode="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder={t("linkPlaceholder")}
                    aria-label={t("link")}
                  />
                  <Button type="submit">{t("linkSubmit")}</Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("linkHint")}</p>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setView("link")}
                className="inline-flex cursor-pointer items-center gap-2 self-start text-sm font-medium text-accent-foreground hover:underline"
              >
                <Link2 className="size-4" /> {t("link")}
              </button>
            )}
          </>
        )}

        {items.length > 0 && (
          <ul className="max-h-64 space-y-2 overflow-y-auto" aria-live="polite">
            {items.map((item) => (
              <UploadRow key={item.id} item={item} onRetry={() => retry(item.id)} />
            ))}
          </ul>
        )}

        {allFinished && done.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => close(false)}>
              {t("close")}
            </Button>
            {done.length === 1 && done[0]!.documentId && (
              <Button asChild>
                <Link href={`/app/documents/${done[0]!.documentId}`} onClick={() => close(false)}>
                  {t("sign")}
                </Link>
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UploadRow({ item, onRetry }: { item: UploadItem; onRetry: () => void }) {
  const t = useTranslations("documents.upload");
  const errorKey = item.error ?? "generic";
  const errors = [
    "too_large",
    "unsupported",
    "encrypted",
    "corrupted",
    "empty",
    "conversion_failed",
    "conversion_unavailable",
    "storage_full",
    "read_only",
    "feature_not_in_plan",
    "email_unverified",
    "unauthenticated",
    "invalid_url",
    "blocked",
    "not_found",
    "timeout",
    "rate_limited",
    "network",
  ];
  const errorText = t(
    `errors.${errors.includes(errorKey) ? errorKey : "generic"}` as "errors.generic",
    { max: MAX_UPLOAD_MB },
  );

  const progress =
    item.stage === "uploading"
      ? 10 + item.progress * 60
      : item.stage === "processing" || item.stage === "converting"
        ? 80
        : item.stage === "thumbnail"
          ? 95
          : item.stage === "done"
            ? 100
            : 5;

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-background-elevated/60 p-3">
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          item.stage === "error"
            ? "bg-destructive/15 text-destructive"
            : item.stage === "done"
              ? "bg-success/15 text-success"
              : "bg-accent text-accent-foreground",
        )}
      >
        {item.stage === "error" ? (
          <AlertCircle className="size-5" />
        ) : item.stage === "done" ? (
          <CheckCircle2 className="size-5" />
        ) : (
          <FileText className="size-5" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium">{item.name}</p>
          {item.size > 0 && (
            <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(item.size)}</span>
          )}
        </div>
        {item.stage === "error" ? (
          <p className="text-xs text-destructive">{errorText}</p>
        ) : (
          <>
            <Progress value={progress} className="h-1.5" />
            <p className="text-xs text-muted-foreground">
              {t(`stages.${item.stage}`, { percent: Math.round(item.progress * 100) })}
            </p>
          </>
        )}
      </div>
      {item.stage === "error" &&
        item.source.type === "file" &&
        !["unsupported", "encrypted", "too_large"].includes(errorKey) && (
          <Button variant="ghost" size="icon-sm" onClick={onRetry} aria-label="Réessayer">
            <RotateCcw />
          </Button>
        )}
    </li>
  );
}
