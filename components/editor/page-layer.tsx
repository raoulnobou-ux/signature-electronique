"use client";

import { Check } from "lucide-react";
import { useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PageSize } from "@/components/documents/pdf-viewer";
import { isImageField } from "@/lib/pdf/fields";
import { cn } from "@/lib/utils";
import { snap, type EditorField } from "./state";

type Corner = "nw" | "ne" | "se" | "sw";

type Props = {
  pageIndex: number;
  size: PageSize;
  fields: EditorField[];
  selectedId: string | null;
  assetUrls: Record<string, string>;
  armed: boolean;
  onPlace: (pageIndex: number, xPct: number, yPct: number) => void;
  onSelect: (id: string | null) => void;
  /** Changement en direct (pendant le geste) — au relâchement, `done` et l'état initial du champ. */
  onChange: (field: EditorField, done: boolean, original?: EditorField) => void;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Calque posé sur une page du PDF : placement au toucher, déplacement, redimensionnement
 * par les coins (proportions conservées pour les images), guides d'alignement.
 * Les champs ont touch-action: none (pas de conflit avec le défilement de la page).
 */
export function PageLayer({ pageIndex, size, fields, selectedId, assetUrls, armed, onPlace, onSelect, onChange }: Props) {
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const pageFields = fields.filter((f) => f.page === pageIndex);

  const startGesture = (event: ReactPointerEvent, field: EditorField, mode: "move" | Corner) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(field.id);
    // Dimensions du calque de la page, lues sur l'élément du geste (pas de ref pendant le rendu).
    const layer = (event.currentTarget as HTMLElement).closest("[data-page-layer]") as HTMLElement;
    const rect = layer.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY, field };
    const ratio = field.h / field.w;
    const keepRatio = isImageField(field.type) || field.type === "checkbox";
    const others = pageFields.filter((f) => f.id !== field.id);
    const xTargets = [0, 50, 100, ...others.flatMap((f) => [f.x, f.x + f.w / 2, f.x + f.w])];
    const yTargets = [0, 50, 100, ...others.flatMap((f) => [f.y, f.y + f.h / 2, f.y + f.h])];
    let latest = field;
    let moved = false;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    const move = (e: PointerEvent) => {
      const dx = ((e.clientX - start.x) / rect.width) * 100;
      const dy = ((e.clientY - start.y) / rect.height) * 100;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 0.3) return;
      moved = true;
      const f = start.field;
      let next: EditorField;
      if (mode === "move") {
        const sx = snap(clamp(f.x + dx, 0, 100 - f.w), f.w, xTargets);
        const sy = snap(clamp(f.y + dy, 0, 100 - f.h), f.h, yTargets);
        setGuides({ x: sx.guide, y: sy.guide });
        next = { ...f, x: clamp(sx.value, 0, 100 - f.w), y: clamp(sy.value, 0, 100 - f.h) };
      } else {
        // Le coin opposé reste fixe.
        const right = f.x + f.w;
        const bottom = f.y + f.h;
        let w = mode === "se" || mode === "ne" ? f.w + dx : f.w - dx;
        let h = mode === "se" || mode === "sw" ? f.h + dy : f.h - dy;
        w = clamp(w, 2, 100);
        h = keepRatio ? w * ratio : clamp(h, 1, 100);
        const x = mode === "nw" || mode === "sw" ? right - w : f.x;
        const y = mode === "nw" || mode === "ne" ? bottom - h : f.y;
        if (x < 0 || y < 0 || x + w > 100.01 || y + h > 100.01) return;
        next = { ...f, x, y, w, h };
      }
      latest = next;
      onChange(next, false);
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      setGuides({ x: null, y: null });
      if (moved) onChange(latest, true, start.field);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  return (
    <div
      data-page-layer
      data-testid={`page-layer-${pageIndex}`}
      className={cn("absolute inset-0", armed && "cursor-crosshair bg-brand-violet/[0.04]")}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (armed) {
          const rect = e.currentTarget.getBoundingClientRect();
          onPlace(pageIndex, ((e.clientX - rect.left) / rect.width) * 100, ((e.clientY - rect.top) / rect.height) * 100);
        } else onSelect(null);
      }}
    >
      {guides.x !== null && <div aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-brand-cyan" style={{ left: `${guides.x}%` }} />}
      {guides.y !== null && <div aria-hidden className="pointer-events-none absolute inset-x-0 h-px bg-brand-cyan" style={{ top: `${guides.y}%` }} />}

      {pageFields.map((field) => {
        const selected = field.id === selectedId;
        const fontPx = (field.h / 100) * size.height * (field.type === "checkbox" ? 0.8 : 0.72);
        return (
          <div
            key={field.id}
            role="button"
            tabIndex={0}
            aria-label={`${field.type}${field.value ? ` : ${field.value}` : ""}`}
            aria-pressed={selected}
            data-field-type={field.type}
            onPointerDown={(e) => startGesture(e, field, "move")}
            onFocus={() => onSelect(field.id)}
            className={cn(
              "group absolute cursor-move touch-none outline-none select-none",
              selected ? "z-20" : "z-10",
            )}
            style={{
              left: `${field.x}%`,
              top: `${field.y}%`,
              width: `${field.w}%`,
              height: `${field.h}%`,
              transform: field.rotation ? `rotate(${field.rotation}deg)` : undefined,
              opacity: field.opacity,
            }}
          >
            <div
              className={cn(
                "absolute inset-0 rounded-[3px] ring-offset-0 transition-shadow",
                selected ? "ring-2 ring-brand-violet shadow-[0_0_0_4px_rgb(139_92_246/0.18)]" : "ring-1 ring-brand-violet/0 group-hover:ring-brand-violet/60",
                !isImageField(field.type) && !selected && "bg-brand-violet/[0.06]",
              )}
            />
            {isImageField(field.type) ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire
              <img src={assetUrls[field.assetId!]} alt="" draggable={false} className="pointer-events-none size-full object-contain" />
            ) : field.type === "checkbox" ? (
              <div className="pointer-events-none flex size-full items-center justify-center rounded-[2px] border-2 border-slate-900 text-slate-900">
                {field.value === "true" && <Check strokeWidth={3.5} style={{ width: "80%", height: "80%" }} />}
              </div>
            ) : (
              <div
                className="pointer-events-none flex size-full items-center overflow-hidden whitespace-nowrap text-[#131722]"
                style={{ fontSize: fontPx, fontFamily: "Helvetica, Arial, sans-serif", lineHeight: 1 }}
              >
                {field.value}
              </div>
            )}

            {selected &&
              (["nw", "ne", "se", "sw"] as const).map((corner) => (
                <span
                  key={corner}
                  role="presentation"
                  onPointerDown={(e) => startGesture(e, field, corner)}
                  className={cn(
                    // Zone tactile de 32 px, pastille visible de 14 px.
                    "absolute flex size-8 touch-none items-center justify-center",
                    corner === "nw" && "-top-4 -left-4 cursor-nwse-resize",
                    corner === "ne" && "-top-4 -right-4 cursor-nesw-resize",
                    corner === "se" && "-right-4 -bottom-4 cursor-nwse-resize",
                    corner === "sw" && "-bottom-4 -left-4 cursor-nesw-resize",
                  )}
                >
                  <span className="size-3.5 rounded-full border-2 border-white bg-brand-violet shadow-soft" />
                </span>
              ))}
          </div>
        );
      })}
    </div>
  );
}
