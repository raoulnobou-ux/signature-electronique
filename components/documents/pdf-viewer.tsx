"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { openPdf, renderPage } from "@/lib/pdf/client";
import { cn } from "@/lib/utils";

export type PageSize = { width: number; height: number };

type PdfViewerProps = {
  /** URL signée du PDF ou octets. */
  source: string | ArrayBuffer;
  className?: string;
  /** Contenu superposé à chaque page (champs de signature en Phase 5). */
  renderOverlay?: (pageIndex: number, size: PageSize) => ReactNode;
  onLoaded?: (info: { pageCount: number; sizes: PageSize[] }) => void;
  /** Largeur maximale d'une page (px CSS) à 100 %. */
  maxPageWidth?: number;
};

/**
 * Visionneuse PDF légère : pages rendues à la demande (défilement), zoom, plein écran,
 * indicateur de page. Les tailles de page servent au positionnement en pourcentage.
 */
export function PdfViewer({
  source,
  className,
  renderOverlay,
  onLoaded,
  maxPageWidth = 860,
}: PdfViewerProps) {
  const t = useTranslations("documents.detail");
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [current, setCurrent] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    openPdf(source)
      .then(async (loaded) => {
        if (cancelled) return;
        doc = loaded;
        const list: PageSize[] = [];
        for (let i = 1; i <= loaded.numPages; i++) {
          const viewport = (await loaded.getPage(i)).getViewport({ scale: 1 });
          list.push({ width: viewport.width, height: viewport.height });
        }
        if (cancelled) return;
        setSizes(list);
        setPdf(loaded);
        onLoaded?.({ pageCount: loaded.numPages, sizes: list });
      })
      .catch((e) => {
        console.error("[pdf]", e);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      void doc?.loadingTask.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recharger uniquement si la source change
  }, [source]);

  // Largeur disponible (responsive).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const pageWidth = Math.max(240, Math.min(maxPageWidth, width - 16) * zoom);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current?.parentElement?.requestFullscreen();
  };

  if (error) {
    return (
      <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        {t("loadError")}
      </p>
    );
  }

  return (
    <div
      className={cn("relative flex flex-col bg-muted/40", fullscreen && "bg-background", className)}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-background/85 px-3 py-2 backdrop-blur">
        <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {pdf ? t("page", { n: current, total: pdf.numPages }) : t("loading")}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("zoomOut")}
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
          >
            <ZoomOut />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)} %</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("zoomIn")}
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
          >
            <ZoomIn />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("fullscreen")}
            onClick={toggleFullscreen}
          >
            {fullscreen ? <Minimize2 /> : <Maximize2 />}
          </Button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto px-2 py-4 sm:px-4">
        {!pdf || !width ? (
          <div className="mx-auto w-full max-w-[860px] space-y-4">
            <Skeleton className="aspect-[1/1.414] w-full" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {sizes.map((size, index) => (
              <PdfPage
                key={index}
                pdf={pdf}
                index={index}
                size={size}
                width={pageWidth}
                onVisible={setCurrent}
                overlay={renderOverlay?.(index, size)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PdfPage({
  pdf,
  index,
  size,
  width,
  onVisible,
  overlay,
}: {
  pdf: PDFDocumentProxy;
  index: number;
  size: PageSize;
  width: number;
  onVisible: (page: number) => void;
  overlay?: ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(index < 2);
  const [rendered, setRendered] = useState(false);
  const height = (size.height / size.width) * width;

  // Rendu paresseux : seulement quand la page approche de l'écran.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setNear(true);
          if (entry.intersectionRatio > 0.5) onVisible(index + 1);
        }
      },
      { rootMargin: "600px 0px", threshold: [0, 0.5] },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [index, onVisible]);

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const page = await pdf.getPage(index + 1);
    await renderPage(page, canvas, width);
    setRendered(true);
  }, [pdf, index, width]);

  useEffect(() => {
    if (!near) return;
    const id = setTimeout(() => void draw(), 60); // regroupe les changements de zoom rapides
    return () => clearTimeout(id);
  }, [near, draw]);

  return (
    <div
      ref={wrapperRef}
      data-page={index}
      className="relative shrink-0 overflow-hidden rounded-sm bg-white shadow-lift"
      style={{ width, height }}
    >
      {!rendered && <Skeleton className="absolute inset-0 rounded-none" />}
      <canvas ref={canvasRef} className="block size-full" aria-label={`Page ${index + 1}`} />
      {overlay && <div className="absolute inset-0">{overlay}</div>}
    </div>
  );
}
