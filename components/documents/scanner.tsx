"use client";

import { Camera, Check, Plus, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Point, Quad } from "@/lib/images/geometry";
import {
  canvasToJpeg,
  detectQuad,
  loadBitmap,
  straighten,
  type ScanMode,
} from "@/lib/images/browser";
import { cn } from "@/lib/utils";

type Page = { id: string; blob: Blob; preview: string };

/** Fusionne les pages scannées (JPEG) en un seul PDF A4, dans le navigateur. */
async function pagesToPdf(pages: Page[]): Promise<File> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (const page of pages) {
    const image = await doc.embedJpg(await page.blob.arrayBuffer());
    const A4 = image.width > image.height ? [841.89, 595.28] : [595.28, 841.89];
    const pdfPage = doc.addPage(A4 as [number, number]);
    const scale = Math.min(A4[0]! / image.width, A4[1]! / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    pdfPage.drawImage(image, { x: (A4[0]! - w) / 2, y: (A4[1]! - h) / 2, width: w, height: h });
  }
  doc.setProducer("QuickSign");
  const bytes = await doc.save();
  const date = new Date().toISOString().slice(0, 10);
  return new File([bytes as BlobPart], `Scan ${date}.pdf`, { type: "application/pdf" });
}

/**
 * Scanner : photo → détection automatique de la feuille → coins ajustables au doigt →
 * redressement + mode « document » → une ou plusieurs pages → PDF.
 */
export function Scanner({
  onDone,
  onCancel,
}: {
  onDone: (file: File) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("documents.scanner");
  const inputRef = useRef<HTMLInputElement>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [mode, setMode] = useState<ScanMode>("document");
  const [pages, setPages] = useState<Page[]>([]);
  const [busy, setBusy] = useState(false);

  // Ouvre directement l'appareil photo à l'ouverture du scanner.
  useEffect(() => {
    inputRef.current?.click();
  }, []);

  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.preview)), [pages]);

  const onFile = async (file: File | undefined) => {
    if (!file) {
      if (!bitmap && pages.length === 0) onCancel();
      return;
    }
    setBusy(true);
    try {
      const bmp = await loadBitmap(file);
      setBitmap(bmp);
      setQuad(detectQuad(bmp));
    } finally {
      setBusy(false);
    }
  };

  const rotate = async (direction: 1 | -1) => {
    if (!bitmap) return;
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.height;
    canvas.height = bitmap.width;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((direction * Math.PI) / 2);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    const rotated = await createImageBitmap(canvas);
    setBitmap(rotated);
    setQuad(detectQuad(rotated));
  };

  const addPage = async () => {
    if (!bitmap || !quad) return;
    setBusy(true);
    // Laisse le navigateur afficher l'état « Redressement… » avant le calcul.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const canvas = straighten(bitmap, quad, mode);
    const blob = await canvasToJpeg(canvas, 0.82);
    setPages((all) => [
      ...all,
      { id: crypto.randomUUID(), blob, preview: URL.createObjectURL(blob) },
    ]);
    setBitmap(null);
    setQuad(null);
    setBusy(false);
    return true;
  };

  const finish = async (pagesToUse: Page[]) => {
    setBusy(true);
    onDone(await pagesToPdf(pagesToUse));
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {bitmap && quad ? (
        <>
          <p className="text-sm text-muted-foreground">{t("adjust")}</p>
          <QuadEditor bitmap={bitmap} quad={quad} onChange={setQuad} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              role="radiogroup"
              aria-label={t("mode")}
              className="inline-flex rounded-full border border-border bg-secondary p-1"
            >
              {(["document", "color"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "h-9 cursor-pointer rounded-full px-4 text-sm font-medium",
                    mode === m ? "bg-background-elevated shadow-soft" : "text-muted-foreground",
                  )}
                >
                  {m === "document" ? t("modeDocument") : t("modeColor")}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("rotate")}
                onClick={() => rotate(-1)}
              >
                <RotateCcw />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("rotate")}
                onClick={() => rotate(1)}
              >
                <RotateCw />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setBitmap(null);
                inputRef.current?.click();
              }}
            >
              <Camera /> {t("retake")}
            </Button>
            <Button loading={busy} onClick={() => void addPage()}>
              <Check /> {t("use")}
            </Button>
          </div>
        </>
      ) : busy ? (
        <div className="space-y-3">
          <Skeleton className="aspect-[3/4] w-full" />
          <p className="text-center text-sm text-muted-foreground">{t("detecting")}</p>
        </div>
      ) : null}

      {pages.length > 0 && !bitmap && (
        <div className="space-y-4">
          <ul className="grid grid-cols-3 gap-2">
            {pages.map((page, i) => (
              <li
                key={page.id}
                className="group relative overflow-hidden rounded-xl border border-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:) */}
                <img
                  src={page.preview}
                  alt={`Page ${i + 1}`}
                  className="aspect-[3/4] w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setPages((all) => all.filter((p) => p.id !== page.id))}
                  className="absolute top-1.5 right-1.5 flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white"
                  aria-label={t("removePage")}
                >
                  <Trash2 className="size-4" />
                </button>
                <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 text-xs text-white">
                  {i + 1}
                </span>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => inputRef.current?.click()}>
              <Plus /> {t("addPage")}
            </Button>
            <Button loading={busy} onClick={() => void finish(pages)}>
              <Check /> {t("finish", { count: pages.length })}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Photo + quadrilatère ajustable : poignées larges (48 px) pour le doigt. */
function QuadEditor({
  bitmap,
  quad,
  onChange,
}: {
  bitmap: ImageBitmap;
  quad: Quad;
  onChange: (q: Quad) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }, [bitmap]);

  const toImage = (e: ReactPointerEvent): Point => {
    const rect = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(bitmap.width, ((e.clientX - rect.left) / rect.width) * bitmap.width)),
      y: Math.max(
        0,
        Math.min(bitmap.height, ((e.clientY - rect.top) / rect.height) * bitmap.height),
      ),
    };
  };

  const pct = (p: Point) => ({
    left: `${(p.x / bitmap.width) * 100}%`,
    top: `${(p.y / bitmap.height) * 100}%`,
  });
  const points = quad
    .map((p) => `${(p.x / bitmap.width) * 100},${(p.y / bitmap.height) * 100}`)
    .join(" ");

  return (
    <div
      ref={boxRef}
      className="relative mx-auto max-h-[60dvh] touch-none overflow-hidden rounded-2xl bg-black select-none"
      style={{ aspectRatio: `${bitmap.width} / ${bitmap.height}` }}
      onPointerMove={(e) => {
        if (dragging === null) return;
        const next = [...quad] as Quad;
        next[dragging] = toImage(e);
        onChange(next);
      }}
      onPointerUp={() => setDragging(null)}
      onPointerCancel={() => setDragging(null)}
    >
      <canvas ref={canvasRef} className="size-full" />
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full"
      >
        <polygon
          points={points}
          fill="rgb(99 102 241 / 0.18)"
          stroke="#8B5CF6"
          strokeWidth="0.6"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {quad.map((p, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Coin ${i + 1}`}
          onPointerDown={(e) => {
            e.currentTarget.parentElement?.setPointerCapture(e.pointerId);
            setDragging(i);
          }}
          className="absolute flex size-12 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center"
          style={pct(p)}
        >
          <span className="size-5 rounded-full border-2 border-white bg-brand-violet shadow-[0_0_0_4px_rgb(139_92_246/0.35)]" />
        </button>
      ))}
    </div>
  );
}
