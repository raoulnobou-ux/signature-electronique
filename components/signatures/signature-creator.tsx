"use client";

import { Eraser, ImageUp, Keyboard, PenLine, Stamp, Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type SignaturePadType from "signature_pad";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  createSignatureAsset,
  type AssetType,
  type SignatureAsset,
} from "@/app/(app)/app/signatures/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  canvasToPngBlob,
  HANDWRITING_FONTS,
  loadHandwritingFonts,
  removeBackground,
  renderTypedSignature,
  trimCanvas,
  type TrimmedImage,
} from "@/lib/images/signature";
import {
  renderStampSvg,
  renderStatusStampSvg,
  STAMP_COLORS,
  STAMP_PRESETS,
  STAMP_SHAPES,
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_STAMPS,
  type StampColor,
  type StampOptions,
  type StatusStamp,
} from "@/lib/images/stamp";
import { cn } from "@/lib/utils";

const INKS = [
  { key: "navy", value: "#0B1F5C" },
  { key: "blue", value: "#1D4ED8" },
  { key: "black", value: "#111827" },
] as const;

type Method = "draw" | "type" | "upload" | "generate";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type?: AssetType;
  /** Le type peut-il être changé dans la fenêtre (signature ↔ paraphe ↔ cachet) ? */
  allowTypeChange?: boolean;
  stampsAllowed?: boolean;
  onCreated?: (asset: SignatureAsset) => void;
};

/** Réinitialise entièrement la fenêtre à chaque ouverture (nouvelle instance). */
export function SignatureCreator(props: Props) {
  return (
    <CreatorDialog key={props.open ? `open-${props.type ?? "signature"}` : "closed"} {...props} />
  );
}

function CreatorDialog({
  open,
  onOpenChange,
  type: initialType = "signature",
  allowTypeChange = true,
  stampsAllowed = true,
  onCreated,
}: Props) {
  const t = useTranslations("signatures");
  const tc = useTranslations("signatures.creator");
  const [type, setType] = useState<AssetType>(initialType);
  const [method, setMethod] = useState<Method>(initialType === "stamp" ? "generate" : "draw");
  const [ink, setInk] = useState<string>(INKS[0].value);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const getImage = useRef<
    () => Promise<{ image: TrimmedImage; svg?: string; name?: string } | null>
  >(async () => null);

  const save = async () => {
    const result = await getImage.current();
    if (!result) {
      toast.error(
        method === "draw"
          ? tc("draw.empty")
          : method === "type"
            ? tc("type.empty")
            : method === "generate"
              ? tc("stamp.empty")
              : tc("upload.invalid"),
      );
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.append("png", await canvasToPngBlob(result.image.canvas), "signature.png");
      if (result.svg)
        form.append("svg", new Blob([result.svg], { type: "image/svg+xml" }), "signature.svg");
      form.append("name", name.trim() || result.name || tc(`namePlaceholders.${type}`));
      form.append("type", type);
      form.append("method", method === "generate" ? "generated" : method);
      form.append("width", String(result.image.width));
      form.append("height", String(result.image.height));
      const response = await createSignatureAsset(form);
      if (!response.ok) {
        toast.error(
          response.error === "limit_reached"
            ? t("limitReached", { max: 5 })
            : response.error === "feature_not_in_plan"
              ? t("proOnly")
              : t("toasts.error"),
        );
        return;
      }
      // Petite animation « la signature s'écrit » avant de refermer.
      setCelebrate(result.image.canvas.toDataURL("image/png"));
      toast.success(t("toasts.created"));
      onCreated?.(response.asset);
      setTimeout(() => onOpenChange(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  const title =
    type === "stamp" ? tc("titleStamp") : type === "initials" ? tc("titleInitials") : tc("title");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullScreenOnMobile className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>

        {celebrate ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-4">
            <div className="relative w-full max-w-md rounded-2xl bg-white p-6">
              {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local généré */}
              <img
                src={celebrate}
                alt=""
                className="mx-auto max-h-40 animate-write-in object-contain"
              />
            </div>
            <p className="font-display text-lg font-semibold">{t("toasts.created")}</p>
          </div>
        ) : (
          <>
            {allowTypeChange && (
              <div
                role="radiogroup"
                aria-label={tc("kind")}
                className="inline-flex self-start rounded-full border border-border bg-secondary p-1"
              >
                {(["signature", "initials", "stamp"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={type === k}
                    disabled={k === "stamp" && !stampsAllowed}
                    onClick={() => {
                      setType(k);
                      if (k === "stamp") setMethod("generate");
                      else if (method === "generate") setMethod("draw");
                    }}
                    className={cn(
                      "h-9 cursor-pointer rounded-full px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40",
                      type === k ? "bg-background-elevated shadow-soft" : "text-muted-foreground",
                    )}
                  >
                    {tc(`kinds.${k}`)}
                  </button>
                ))}
              </div>
            )}

            <Tabs value={method} onValueChange={(v) => setMethod(v as Method)}>
              {type === "stamp" ? (
                <TabsList>
                  <TabsTrigger value="generate">
                    <Stamp aria-hidden /> {tc("tabs.generate")}
                  </TabsTrigger>
                  <TabsTrigger value="upload">
                    <ImageUp aria-hidden /> {tc("tabs.upload")}
                  </TabsTrigger>
                </TabsList>
              ) : (
                <TabsList>
                  <TabsTrigger value="draw">
                    <PenLine aria-hidden /> {tc("tabs.draw")}
                  </TabsTrigger>
                  <TabsTrigger value="type">
                    <Keyboard aria-hidden /> {tc("tabs.type")}
                  </TabsTrigger>
                  <TabsTrigger value="upload">
                    <ImageUp aria-hidden /> {tc("tabs.upload")}
                  </TabsTrigger>
                </TabsList>
              )}
              <TabsContent value="draw">
                {method === "draw" && (
                  <DrawPad
                    ink={ink}
                    register={(fn) => (getImage.current = fn)}
                    initials={type === "initials"}
                  />
                )}
              </TabsContent>
              <TabsContent value="type">
                {method === "type" && (
                  <TypePad ink={ink} register={(fn) => (getImage.current = fn)} />
                )}
              </TabsContent>
              <TabsContent value="upload">
                {method === "upload" && <UploadPad register={(fn) => (getImage.current = fn)} />}
              </TabsContent>
              <TabsContent value="generate">
                {method === "generate" && <StampPad register={(fn) => (getImage.current = fn)} />}
              </TabsContent>
            </Tabs>

            {(method === "draw" || method === "type") && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{tc("draw.color")}</span>
                <div role="radiogroup" aria-label={tc("draw.color")} className="flex gap-2">
                  {INKS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      role="radio"
                      aria-checked={ink === c.value}
                      aria-label={tc(`draw.colors.${c.key}`)}
                      onClick={() => setInk(c.value)}
                      className={cn(
                        "size-8 cursor-pointer rounded-full ring-offset-2 ring-offset-popover transition",
                        ink === c.value && "ring-2 ring-ring",
                      )}
                      style={{ backgroundColor: c.value }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="asset-name">{tc("name")}</Label>
                <Input
                  id="asset-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={tc(`namePlaceholders.${type}`)}
                  maxLength={80}
                />
              </div>
              <Button size="lg" onClick={() => void save()} loading={saving}>
                {tc("save")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type Register = (fn: () => Promise<{ image: TrimmedImage; svg?: string } | null>) => void;

/** Zone de dessin : trait lissé à épaisseur variable (signature_pad), lueur pendant le tracé. */
export function DrawPad({
  ink,
  register,
  initials,
}: {
  ink: string;
  register: Register;
  initials: boolean;
}) {
  const tc = useTranslations("signatures.creator.draw");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadType | null>(null);
  const [empty, setEmpty] = useState(true);
  const [thickness, setThickness] = useState(2.2);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const pad = padRef.current;
    if (!canvas || !pad) return;
    const data = pad.toData();
    // Résolution interne ≥ 2,5× : export net pour l'impression.
    const ratio = Math.max(window.devicePixelRatio || 1, 2.5);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d")!.scale(ratio, ratio);
    pad.clear();
    pad.fromData(data);
  }, []);

  useEffect(() => {
    let disposed = false;
    void import("signature_pad").then(({ default: SignaturePad }) => {
      if (disposed || !canvasRef.current) return;
      const pad = new SignaturePad(canvasRef.current, {
        penColor: ink,
        minWidth: thickness * 0.45,
        maxWidth: thickness * 1.5,
        velocityFilterWeight: 0.6,
        throttle: 8,
      });
      pad.addEventListener("endStroke", () => setEmpty(pad.isEmpty()));
      padRef.current = pad;
      resize();
    });
    window.addEventListener("resize", resize);
    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      padRef.current?.off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialisation unique
  }, []);

  // Couleur et épaisseur : appliquées aussi aux traits déjà dessinés.
  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;
    pad.penColor = ink;
    pad.minWidth = thickness * 0.45;
    pad.maxWidth = thickness * 1.5;
    const data = pad.toData().map((group) => ({
      ...group,
      penColor: ink,
      minWidth: thickness * 0.45,
      maxWidth: thickness * 1.5,
    }));
    pad.clear();
    pad.fromData(data);
  }, [ink, thickness]);

  useEffect(() => {
    register(async () => {
      const pad = padRef.current;
      const canvas = canvasRef.current;
      if (!pad || !canvas || pad.isEmpty()) return null;
      const image = trimCanvas(canvas, 16);
      return image ? { image, svg: pad.toSVG() } : null;
    });
  }, [register]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{tc("hint")}</p>
      <div className="relative overflow-hidden rounded-2xl border border-border bg-white">
        <canvas
          ref={canvasRef}
          aria-label={tc("hint")}
          className={cn(
            "block w-full touch-none [filter:drop-shadow(0_0_5px_rgb(139_92_246/0.45))]",
            initials ? "h-44" : "h-56 sm:h-64",
          )}
        />
        {/* Ligne de base, guide visuel (non exportée) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-8 bottom-12 border-b border-dashed border-slate-300"
        />
        {empty && (
          <p
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-5 text-center text-xs text-slate-400"
          >
            {tc("baseline")}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 text-sm text-muted-foreground">
          {tc("thickness")}
          <input
            type="range"
            min={1}
            max={4}
            step={0.2}
            value={thickness}
            onChange={(e) => setThickness(Number(e.target.value))}
            className="w-28 accent-brand-violet"
          />
        </label>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={empty}
            onClick={() => {
              const pad = padRef.current!;
              const data = pad.toData();
              data.pop();
              pad.fromData(data);
              setEmpty(pad.isEmpty());
            }}
          >
            <Undo2 /> {tc("undo")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={empty}
            onClick={() => {
              padRef.current?.clear();
              setEmpty(true);
            }}
          >
            <Eraser /> {tc("clear")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Nom tapé : aperçu instantané dans six écritures manuscrites. */
export function TypePad({
  ink,
  register,
  initialText = "",
}: {
  ink: string;
  register: Register;
  initialText?: string;
}) {
  const tc = useTranslations("signatures.creator.type");
  const [text, setText] = useState(initialText);
  const [family, setFamily] = useState<string>(HANDWRITING_FONTS[0].family);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadHandwritingFonts().then(() => setReady(true));
  }, []);

  useEffect(() => {
    register(async () => {
      if (!text.trim()) return null;
      await loadHandwritingFonts();
      const image = renderTypedSignature(text.trim(), family, ink);
      return image ? { image } : null;
    });
  }, [register, text, family, ink]);

  return (
    <div className="space-y-3">
      <Input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={tc("placeholder")}
        maxLength={60}
        aria-label={tc("placeholder")}
      />
      <p className="text-sm text-muted-foreground">{tc("hint")}</p>
      <div role="radiogroup" aria-label={tc("hint")} className="grid gap-2 sm:grid-cols-2">
        {HANDWRITING_FONTS.map((font) =>
          ready ? (
            <button
              key={font.family}
              type="button"
              role="radio"
              aria-checked={family === font.family}
              onClick={() => setFamily(font.family)}
              className={cn(
                "flex h-20 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border bg-white px-4 text-3xl transition-all",
                family === font.family
                  ? "border-brand-violet ring-4 ring-ring/25"
                  : "border-border hover:border-ring/50",
              )}
              style={{ fontFamily: `"QS ${font.family}"`, color: ink }}
            >
              <span className="truncate">{text || "Awa Nkeng"}</span>
            </button>
          ) : (
            <Skeleton key={font.family} className="h-20 rounded-2xl" />
          ),
        )}
      </div>
    </div>
  );
}

/** Photo d'une signature ou d'un cachet : détourage réglable, aperçu avant/après. */
function UploadPad({ register }: { register: Register }) {
  const tc = useTranslations("signatures.creator.upload");
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [threshold, setThreshold] = useState(200);
  const [before, setBefore] = useState<string | null>(null);

  const processed = useMemo(
    () => (source ? trimCanvas(removeBackground(source, threshold), 8) : null),
    [source, threshold],
  );
  const after = useMemo(() => processed?.canvas.toDataURL("image/png") ?? null, [processed]);

  useEffect(() => {
    register(async () => (processed ? { image: processed } : null));
  }, [register, processed]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      setSource(canvas);
      setBefore(canvas.toDataURL("image/jpeg", 0.8));
    } catch {
      toast.error(tc("invalid"));
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        data-testid="signature-upload-input"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <Button variant="secondary" onClick={() => inputRef.current?.click()}>
        <ImageUp /> {tc("choose")}
      </Button>
      <p className="text-sm text-muted-foreground">{tc("hint")}</p>
      {before && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <figure className="space-y-1.5">
              <figcaption className="text-xs text-muted-foreground">{tc("before")}</figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local */}
              <img
                src={before}
                alt={tc("before")}
                className="h-36 w-full rounded-xl border border-border object-contain"
              />
            </figure>
            <figure className="space-y-1.5">
              <figcaption className="text-xs text-muted-foreground">{tc("after")}</figcaption>
              <div className="h-36 rounded-xl border border-border bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
                {after && (
                  // eslint-disable-next-line @next/next/no-img-element -- aperçu local
                  <img src={after} alt={tc("after")} className="size-full object-contain p-2" />
                )}
              </div>
            </figure>
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{tc("threshold")}</span>
            <input
              type="range"
              min={120}
              max={250}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-brand-violet"
            />
            <span className="block text-xs text-muted-foreground">{tc("thresholdHint")}</span>
          </label>
        </>
      )}
    </div>
  );
}

/** Convertit un SVG en image PNG haute définition (fond transparent, marges rognées). */
async function rasterizeSvg(svg: string, scale = 3): Promise<TrimmedImage | null> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return trimCanvas(canvas, 6);
}

/**
 * Générateur de cachet : cachet de structure (nom, fonction, ville, date → rond, ovale ou
 * rectangulaire) ou tampon de statut (« APPROUVÉ », « PAYÉ », « REÇU »…).
 */
function StampPad({ register }: { register: Register }) {
  const tc = useTranslations("signatures.creator.stamp");
  const locale = useLocale();
  const [kind, setKind] = useState<"company" | "status">("company");
  const [status, setStatus] = useState<StatusStamp>("approved");
  const [statusColor, setStatusColor] = useState<StampColor>(STATUS_COLORS.approved);
  const labels = STATUS_LABELS[locale === "en" ? "en" : "fr"];
  const [options, setOptions] = useState<StampOptions>({
    ...STAMP_PRESETS[0]!.options,
    organization: "",
    title: "",
    city: "",
    seed: 7,
  });
  const [withDate, setWithDate] = useState(false);
  const [today] = useState(() =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", {
      dateStyle: "short",
      timeZone: "Africa/Douala",
    }).format(new Date()),
  );
  const svg = useMemo(
    () =>
      kind === "status"
        ? renderStatusStampSvg({
            label: labels[status],
            color: statusColor,
            date: withDate ? today : "",
            organization: options.organization,
            ink: options.ink,
            seed: options.seed,
          })
        : renderStampSvg({ ...options, date: withDate ? today : "" }),
    [kind, labels, status, statusColor, options, withDate, today],
  );
  const set = (patch: Partial<StampOptions>) => setOptions((o) => ({ ...o, ...patch }));

  useEffect(() => {
    register(async () => {
      if (kind === "company" && !options.organization.trim()) return null;
      const image = await rasterizeSvg(svg);
      if (!image) return null;
      // Nom proposé dans la bibliothèque : le statut (« Payé »), sinon celui saisi.
      return { image, svg, name: kind === "status" ? tc(`statuses.${status}`) : undefined };
    });
  }, [register, svg, kind, status, options.organization, tc]);

  return (
    <div className="grid gap-5 sm:grid-cols-[1fr_220px]">
      <div className="space-y-3">
        <div
          role="radiogroup"
          aria-label={tc("kind")}
          className="inline-flex rounded-full border border-border bg-secondary p-1"
        >
          {(["company", "status"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "h-8 cursor-pointer rounded-full px-3 text-xs font-medium",
                kind === k ? "bg-background-elevated shadow-soft" : "text-muted-foreground",
              )}
            >
              {tc(`kinds.${k}`)}
            </button>
          ))}
        </div>
        {kind === "status" ? (
          <StatusFields
            status={status}
            color={statusColor}
            organization={options.organization}
            onStatus={(next) => {
              setStatus(next);
              setStatusColor(STATUS_COLORS[next]);
            }}
            onColor={setStatusColor}
            onOrganization={(organization) => set({ organization })}
          />
        ) : (
          <>
            <div
              role="radiogroup"
              aria-label={tc("presets.label")}
              className="flex flex-wrap gap-2"
            >
              {STAMP_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={
                    preset.options.shape === options.shape &&
                    preset.options.color === options.color &&
                    preset.options.ink === options.ink
                  }
                  onClick={() => set(preset.options)}
                  className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-xs font-medium aria-checked:border-brand-violet aria-checked:bg-accent"
                >
                  {tc(`presets.${preset.id as "classic" | "official" | "oval" | "clean"}`)}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stamp-org">{tc("organization")}</Label>
              <Input
                id="stamp-org"
                value={options.organization}
                maxLength={60}
                placeholder={tc("organizationPlaceholder")}
                onChange={(e) => set({ organization: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="stamp-title">{tc("title")}</Label>
                <Input
                  id="stamp-title"
                  value={options.title}
                  maxLength={40}
                  placeholder={tc("titlePlaceholder")}
                  onChange={(e) => set({ title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stamp-city">{tc("city")}</Label>
                <Input
                  id="stamp-city"
                  value={options.city}
                  maxLength={40}
                  placeholder={tc("cityPlaceholder")}
                  onChange={(e) => set({ city: e.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <div
                role="radiogroup"
                aria-label={tc("shape")}
                className="inline-flex rounded-full border border-border bg-secondary p-1"
              >
                {STAMP_SHAPES.map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    role="radio"
                    aria-checked={options.shape === shape}
                    onClick={() => set({ shape })}
                    className={cn(
                      "h-8 cursor-pointer rounded-full px-3 text-xs font-medium",
                      options.shape === shape
                        ? "bg-background-elevated shadow-soft"
                        : "text-muted-foreground",
                    )}
                  >
                    {tc(`shapes.${shape}`)}
                  </button>
                ))}
              </div>
              <InkColors value={options.color} onChange={(color) => set({ color })} />
            </div>
          </>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={withDate}
              onCheckedChange={setWithDate}
              aria-label={tc("includeDate")}
            />{" "}
            {tc("includeDate")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={Boolean(options.ink)}
              onCheckedChange={(ink) => set({ ink, seed: Math.floor(Math.random() * 900) + 1 })}
              aria-label={tc("ink")}
            />
            {tc("ink")}
          </label>
        </div>
      </div>
      <figure className="flex items-center justify-center rounded-2xl border border-border bg-white p-3">
        <div
          data-testid="stamp-preview"
          className="w-full [&>svg]:h-auto [&>svg]:w-full"
          // SVG produit localement par renderStampSvg (textes échappés).
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <figcaption className="sr-only">{tc("preview")}</figcaption>
      </figure>
    </div>
  );
}

/** Couleurs d'encre des cachets. */
function InkColors({
  value,
  onChange,
}: {
  value: StampColor;
  onChange: (color: StampColor) => void;
}) {
  const tc = useTranslations("signatures.creator.stamp");
  return (
    <div role="radiogroup" aria-label={tc("color")} className="flex gap-2">
      {(Object.keys(STAMP_COLORS) as StampColor[]).map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={tc(`colors.${color}`)}
          onClick={() => onChange(color)}
          className={cn(
            "size-7 cursor-pointer rounded-full ring-offset-2 ring-offset-popover",
            value === color && "ring-2 ring-ring",
          )}
          style={{ backgroundColor: STAMP_COLORS[color] }}
        />
      ))}
    </div>
  );
}

/** Tampon de statut : choix du statut, de l'encre et de la structure (facultative). */
function StatusFields({
  status,
  color,
  organization,
  onStatus,
  onColor,
  onOrganization,
}: {
  status: StatusStamp;
  color: StampColor;
  organization: string;
  onStatus: (status: StatusStamp) => void;
  onColor: (color: StampColor) => void;
  onOrganization: (organization: string) => void;
}) {
  const tc = useTranslations("signatures.creator.stamp");
  return (
    <>
      <div role="radiogroup" aria-label={tc("status")} className="flex flex-wrap gap-2">
        {STATUS_STAMPS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={status === s}
            onClick={() => onStatus(s)}
            className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-xs font-medium aria-checked:border-brand-violet aria-checked:bg-accent"
          >
            {tc(`statuses.${s}`)}
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="status-org">{tc("statusOrganization")}</Label>
        <Input
          id="status-org"
          value={organization}
          maxLength={60}
          placeholder={tc("organizationPlaceholder")}
          onChange={(e) => onOrganization(e.target.value)}
        />
      </div>
      <InkColors value={color} onChange={onColor} />
    </>
  );
}
