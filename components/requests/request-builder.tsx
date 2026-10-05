"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  CheckSquare,
  ListOrdered,
  PenLine,
  Plus,
  Quote,
  Save,
  Send,
  Trash2,
  Type,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createSignatureRequest } from "@/app/(app)/app/demandes/actions";
import { saveTemplate } from "@/app/(app)/app/modeles/actions";
import { PdfViewer, type PageSize } from "@/components/documents/pdf-viewer";
import { PageLayer } from "@/components/editor/page-layer";
import {
  defaultSize,
  newFieldId,
  useEditorState,
  type EditorField,
} from "@/components/editor/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { mentionsFor } from "@/lib/pdf/fields";
import { MAX_SIGNERS, SIGNER_COLORS, type RequestFieldType } from "@/lib/requests/fields";
import { cn } from "@/lib/utils";

export type BuilderField = EditorField & { signer: number; required: boolean; variable?: boolean };
type SignerDraft = { key: string; name: string; email: string; phone: string; role?: string };

const TOOLS: { type: RequestFieldType; icon: LucideIcon }[] = [
  { type: "signature", icon: PenLine },
  { type: "initials", icon: Type },
  { type: "date", icon: CalendarDays },
  { type: "name", icon: UserRound },
  { type: "text", icon: Type },
  { type: "checkbox", icon: CheckSquare },
  { type: "mention", icon: Quote },
];

const newSigner = (): SignerDraft => ({ key: crypto.randomUUID(), name: "", email: "", phone: "" });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type BuilderPreset = {
  signers?: { name: string; email: string; phone: string; role?: string }[];
  fields?: BuilderField[];
  message?: string;
  mode?: "sequential" | "parallel";
  /** Durée de validité en jours (brouillon repris). */
  days?: number;
};

export function RequestBuilder({
  document: doc,
  pdfUrl,
  preset,
  template,
  draftId,
}: {
  document: { id: string; title: string };
  pdfUrl: string;
  preset?: BuilderPreset;
  /** Brouillon repris : sa nouvelle version le remplace. */
  draftId?: string;
  /** Mode « modèle » : des rôles au lieu de personnes, zones variables, enregistrement. */
  template?: { id: string; name: string };
}) {
  const isTemplate = Boolean(template);
  const [templateName, setTemplateName] = useState(template?.name ?? "");
  const t = useTranslations("requests.builder");
  const locale = useLocale();
  const tTools = useTranslations("editor.tools");
  const router = useRouter();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [signers, setSigners] = useState<SignerDraft[]>(() =>
    preset?.signers?.length
      ? preset.signers.map((s) => ({ ...s, key: crypto.randomUUID() }))
      : [newSigner()],
  );
  const [mode, setMode] = useState<"sequential" | "parallel">(preset?.mode ?? "sequential");
  const [message, setMessage] = useState(preset?.message ?? "");
  const [days, setDays] = useState(preset?.days ?? 14);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [current, setCurrent] = useState(0);
  const [armed, setArmed] = useState<RequestFieldType | null>(null);
  const [sending, startSending] = useTransition();
  const editor = useEditorState<BuilderField>(preset?.fields ?? []);
  const { fields, selected, update, select } = editor;

  const signerLabel = (i: number) =>
    signers[i]?.name.trim() || signers[i]?.role || t("signerN", { n: i + 1 });
  const color = (i: number) => SIGNER_COLORS[i % SIGNER_COLORS.length]!;

  // Supprime les zones des signataires retirés.
  useEffect(() => {
    if (fields.some((f) => f.signer >= signers.length))
      update(fields.filter((f) => f.signer < signers.length));
  }, [signers.length, fields, update]);

  const signerErrors = signers.map((s) => {
    if (s.name.trim().length < 2) return isTemplate ? "role" : "name";
    if (isTemplate) return null;
    if (!s.email.trim() && !s.phone.trim()) return "contact";
    if (s.email.trim() && !EMAIL.test(s.email.trim())) return "email";
    return null;
  });
  const signersValid =
    signerErrors.every((e) => e === null) && (!isTemplate || templateName.trim().length > 0);
  const missingZones = signers.map(
    (_, i) =>
      !fields.some(
        (f) => f.signer === i && !f.variable && (f.type === "signature" || f.type === "initials"),
      ),
  );

  const patchSigner = (index: number, patch: Partial<SignerDraft>) =>
    setSigners((list) => list.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const moveSigner = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= signers.length) return;
    setSigners((list) => {
      const next = [...list];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    // Les zones suivent leur signataire.
    update(
      fields.map((f) =>
        f.signer === index
          ? { ...f, signer: target }
          : f.signer === target
            ? { ...f, signer: index }
            : f,
      ),
    );
  };
  const removeSigner = (index: number) => {
    setSigners((list) => list.filter((_, i) => i !== index));
    update(
      fields
        .filter((f) => f.signer !== index)
        .map((f) => (f.signer > index ? { ...f, signer: f.signer - 1 } : f)),
    );
    setCurrent(0);
  };

  const place = (page: number, x: number, y: number) => {
    if (!armed) return;
    const size = sizes[page];
    if (!size) return;
    const { w, h } = defaultSize(armed, size.width / size.height);
    const field: BuilderField = {
      id: newFieldId(),
      page,
      w,
      h,
      x: Math.min(Math.max(0, x - w / 2), 100 - w),
      y: Math.min(Math.max(0, y - h / 2), 100 - h),
      rotation: 0,
      opacity: 1,
      type: armed,
      assetId: null,
      value:
        armed === "mention" ? mentionsFor(locale)[0]! : armed === "text" ? t("textDefault") : null,
      signer: current,
      required: true,
    };
    update([...fields, field]);
    select(field.id);
    setArmed(null);
  };

  const patchSelected = (patch: Partial<BuilderField>) => {
    if (!selected) return;
    update(fields.map((f) => (f.id === selected.id ? { ...f, ...patch } : f)));
  };

  const saveAsTemplate = () =>
    startSending(async () => {
      const result = await saveTemplate(template!.id, {
        name: templateName.trim(),
        mode,
        roles: signers.map((s) => ({ label: s.name.trim() })),
        fields: fields.map((f) => ({
          id: f.id,
          signer: f.signer,
          page: f.page,
          x: f.x,
          y: f.y,
          w: f.w,
          h: f.h,
          type: f.type as RequestFieldType,
          value: f.value ?? null,
          required: f.required,
          variable: Boolean(f.variable),
        })),
      });
      if (result.ok) {
        toast.success(t("templateSaved"));
        router.push("/app/modeles");
      } else
        toast.error(
          t(result.error === "missing_fields" ? "errors.missingTemplate" : "errors.generic"),
        );
    });

  /** Envoi immédiat, ou enregistrement en brouillon (rien n'est envoyé). */
  const submit = (asDraft: boolean) =>
    startSending(async () => {
      const result = await createSignatureRequest({
        asDraft,
        draftId,
        documentId: doc.id,
        mode: signers.length > 1 ? mode : "parallel",
        message: message.trim() || undefined,
        expiresInDays: days,
        signers: signers.map((s) => ({
          name: s.name.trim(),
          email: s.email.trim(),
          phone: s.phone.trim(),
        })),
        fields: fields.map((f) => ({
          id: f.id,
          signer: f.signer,
          page: f.page,
          x: f.x,
          y: f.y,
          w: f.w,
          h: f.h,
          type: f.type as RequestFieldType,
          value: f.value ?? null,
          required: f.required,
        })),
      });
      if (result.ok) {
        toast.success(asDraft ? t("draftSaved") : t("sent"));
        router.push(`/app/demandes/${result.requestId}${asDraft ? "" : "?envoyee=1"}`);
      } else {
        toast.error(
          result.error === "missing_fields" || result.error === "invalid_phone"
            ? t(`errors.${result.error}`, { name: signerLabel(result.signer ?? 0) })
            : t(
                `errors.${result.error === "feature_not_in_plan" || result.error === "already_pending" || result.error === "not_found" || result.error === "read_only" ? result.error : "generic"}`,
              ),
        );
      }
    });

  const renderOverlay = (pageIndex: number, size: PageSize) => (
    <PageLayer<BuilderField>
      pageIndex={pageIndex}
      size={size}
      fields={fields}
      selectedId={editor.selectedId}
      assetUrls={{}}
      armed={armed !== null}
      onPlace={place}
      onSelect={select}
      onChange={(field, done, original) => {
        update(
          fields.map((f) => (f.id === field.id ? field : f)),
          false,
        );
        if (done && original)
          editor.commitFrom(fields.map((f) => (f.id === original.id ? original : f)));
      }}
      renderContent={(field) => (
        <div
          data-signer={field.signer}
          className="pointer-events-none flex size-full items-center justify-center overflow-hidden rounded-[3px] border-2 border-dashed px-1 text-center text-[11px] leading-tight font-semibold"
          style={
            field.variable
              ? { borderColor: "#64748B", backgroundColor: "#64748B1f", color: "#475569" }
              : {
                  borderColor: color(field.signer),
                  backgroundColor: `${color(field.signer)}1f`,
                  color: color(field.signer),
                }
          }
        >
          <span className="truncate">
            {field.variable
              ? t("variableZone", { label: field.value ?? "" })
              : `${tTools(field.type as RequestFieldType)} · ${signerLabel(field.signer)}`}
          </span>
        </div>
      )}
    />
  );

  const steps = [t("steps.signers"), t("steps.zones"), t("steps.send")];

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b border-border bg-background/90 px-3 py-2 sm:px-4 md:backdrop-blur">
        <Button asChild variant="ghost" size="icon-sm" aria-label={t("back")}>
          <Link href={isTemplate ? "/app/modeles" : `/app/documents/${doc.id}`}>
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{doc.title}</p>
          <ol className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {steps.map((label, i) => (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-1.5",
                  i === step && "font-semibold text-foreground",
                )}
              >
                {i > 0 && <span aria-hidden>›</span>}
                <span aria-current={i === step ? "step" : undefined}>{label}</span>
              </li>
            ))}
          </ol>
        </div>
        {step > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setStep((s) => (s - 1) as 0 | 1)}>
            {t("previous")}
          </Button>
        )}
        {step < 2 ? (
          <Button
            size="sm"
            disabled={step === 0 ? !signersValid : missingZones.some(Boolean)}
            onClick={() => setStep((s) => (s + 1) as 1 | 2)}
          >
            {t("next")} <ArrowRight />
          </Button>
        ) : isTemplate ? (
          <Button size="sm" loading={sending} onClick={saveAsTemplate}>
            <Save /> {t("saveTemplate")}
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={sending}
              onClick={() => submit(true)}
              className="hidden sm:inline-flex"
            >
              <Save /> {t("saveDraft")}
            </Button>
            <Button size="sm" loading={sending} onClick={() => submit(false)}>
              <Send /> {t("send")}
            </Button>
          </>
        )}
      </header>

      {step === 0 && (
        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="mx-auto max-w-2xl space-y-6">
            <div>
              <h1 className="font-display text-2xl font-semibold">
                {isTemplate ? t("rolesTitle") : t("signersTitle")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isTemplate ? t("rolesHint") : t("signersHint")}
              </p>
            </div>
            {isTemplate && (
              <div className="space-y-1.5">
                <Label htmlFor="template-name">{t("templateName")}</Label>
                <Input
                  id="template-name"
                  value={templateName}
                  maxLength={120}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
              </div>
            )}
            <ol className="space-y-3">
              {signers.map((s, i) => (
                <li
                  key={s.key}
                  className="rounded-2xl border border-border bg-card p-4"
                  data-testid={`signer-${i}`}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className="flex size-7 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: color(i) }}
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm font-semibold">
                      {signerLabel(i)}
                      {s.role && !isTemplate && (
                        <span className="ml-2 font-normal text-muted-foreground">({s.role})</span>
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("moveUp")}
                      disabled={i === 0}
                      onClick={() => moveSigner(i, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("moveDown")}
                      disabled={i === signers.length - 1}
                      onClick={() => moveSigner(i, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("remove")}
                      disabled={signers.length === 1}
                      onClick={() => removeSigner(i)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  {isTemplate ? (
                    <div className="space-y-1.5">
                      <Label htmlFor={`signer-name-${i}`}>{t("role")}</Label>
                      <Input
                        id={`signer-name-${i}`}
                        value={s.name}
                        maxLength={60}
                        placeholder={t("rolePlaceholder")}
                        onChange={(e) => patchSigner(i, { name: e.target.value })}
                      />
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor={`signer-name-${i}`}>{t("name")}</Label>
                        <Input
                          id={`signer-name-${i}`}
                          value={s.name}
                          maxLength={120}
                          autoComplete="off"
                          placeholder={s.role}
                          onChange={(e) => patchSigner(i, { name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`signer-email-${i}`}>{t("email")}</Label>
                        <Input
                          id={`signer-email-${i}`}
                          type="email"
                          value={s.email}
                          maxLength={320}
                          autoComplete="off"
                          onChange={(e) => patchSigner(i, { email: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`signer-phone-${i}`}>{t("phone")}</Label>
                        <Input
                          id={`signer-phone-${i}`}
                          type="tel"
                          value={s.phone}
                          maxLength={30}
                          placeholder="+237 6…"
                          onChange={(e) => patchSigner(i, { phone: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                  {signerErrors[i] && (s.name || s.email || s.phone) && (
                    <p className="mt-2 text-xs text-destructive">
                      {t(`signerErrors.${signerErrors[i]}`)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
            <Button
              variant="secondary"
              disabled={signers.length >= MAX_SIGNERS}
              onClick={() => setSigners((l) => [...l, newSigner()])}
            >
              <Plus /> {isTemplate ? t("addRole") : t("addSigner")}
            </Button>

            {signers.length > 1 && (
              <div role="radiogroup" aria-label={t("mode")} className="grid gap-2 sm:grid-cols-2">
                {(["sequential", "parallel"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-2xl border p-4 text-left",
                      mode === m
                        ? "border-brand-violet bg-accent"
                        : "border-border hover:bg-secondary",
                    )}
                  >
                    {m === "sequential" ? (
                      <ListOrdered className="mt-0.5 size-5 shrink-0" />
                    ) : (
                      <Users className="mt-0.5 size-5 shrink-0" />
                    )}
                    <span>
                      <span className="block text-sm font-semibold">{t(`modes.${m}.title`)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t(`modes.${m}.hint`)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {!isTemplate && (
              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <div className="space-y-1.5">
                  <Label htmlFor="request-message">{t("message")}</Label>
                  <textarea
                    id="request-message"
                    value={message}
                    maxLength={1000}
                    rows={3}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t("messagePlaceholder")}
                    className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="request-deadline">{t("deadline")}</Label>
                  <select
                    id="request-deadline"
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-sm"
                  >
                    {[3, 7, 14, 30, 60].map((d) => (
                      <option key={d} value={d}>
                        {t("days", { count: d })}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside className="flex shrink-0 flex-col gap-3 overflow-x-auto border-b border-border p-3 lg:w-60 lg:overflow-y-auto lg:border-r lg:border-b-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("zonesFor")}
            </p>
            <div role="radiogroup" aria-label={t("zonesFor")} className="flex gap-2 lg:flex-col">
              {signers.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={current === i}
                  onClick={() => setCurrent(i)}
                  className={cn(
                    "flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm",
                    current === i ? "border-transparent font-semibold text-white" : "border-border",
                  )}
                  style={current === i ? { backgroundColor: color(i) } : undefined}
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: current === i ? "#fff" : color(i) }}
                  />
                  <span className="truncate">{signerLabel(i)}</span>
                  {missingZones[i] && (
                    <span className="ml-auto text-[10px] opacity-80">{t("needsSignature")}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-1 lg:flex-col" aria-label={t("tools")}>
              {TOOLS.map(({ type, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={armed === type}
                  onClick={() => {
                    setArmed((a) => (a === type ? null : type));
                    select(null);
                  }}
                  className={cn(
                    "flex shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium",
                    armed === type
                      ? "bg-brand-gradient text-white"
                      : "text-muted-foreground hover:bg-secondary",
                  )}
                >
                  <Icon className="size-4" aria-hidden /> {tTools(type)}
                </button>
              ))}
            </div>
          </aside>
          <div className="relative min-h-0 min-w-0 flex-1">
            {armed && (
              <div className="absolute inset-x-0 top-12 z-20 flex justify-center px-3">
                <div className="rounded-full glass bg-popover px-4 py-1.5 text-sm shadow-lift">
                  {t("placeHint", { tool: tTools(armed), name: signerLabel(current) })}
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
          {selected && (
            <aside
              className="shrink-0 space-y-4 border-t border-border bg-popover p-4 lg:w-72 lg:border-t-0 lg:border-l"
              aria-label={t("zone")}
            >
              <p className="text-sm font-semibold">
                {tTools(selected.type as RequestFieldType)} · {t("page", { n: selected.page + 1 })}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="zone-signer">{t("assignedTo")}</Label>
                <select
                  id="zone-signer"
                  value={selected.signer}
                  onChange={(e) => patchSelected({ signer: Number(e.target.value) })}
                  className="h-10 w-full rounded-xl border border-input bg-transparent px-3 text-sm"
                >
                  {signers.map((_, i) => (
                    <option key={i} value={i}>
                      {signerLabel(i)}
                    </option>
                  ))}
                </select>
              </div>
              {selected.type === "text" && (
                <div className="space-y-1.5">
                  <Label htmlFor="zone-label">{t("textLabel")}</Label>
                  <Input
                    id="zone-label"
                    value={selected.value ?? ""}
                    maxLength={200}
                    onChange={(e) => patchSelected({ value: e.target.value })}
                  />
                </div>
              )}
              {selected.type === "mention" && (
                <select
                  aria-label={t("mention")}
                  value={selected.value ?? mentionsFor(locale)[0]}
                  onChange={(e) => patchSelected({ value: e.target.value })}
                  className="h-10 w-full rounded-xl border border-input bg-transparent px-3 text-sm"
                >
                  {mentionsFor(locale).map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              )}
              {isTemplate && selected.type === "text" && (
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {t("variable")}
                    <span className="block text-xs text-muted-foreground">{t("variableHint")}</span>
                  </span>
                  <Switch
                    checked={Boolean(selected.variable)}
                    onCheckedChange={(variable) => patchSelected({ variable })}
                  />
                </label>
              )}
              {(selected.type === "text" || selected.type === "checkbox") && (
                <label className="flex items-center justify-between gap-3 text-sm">
                  {t("required")}
                  <Switch
                    checked={selected.required}
                    onCheckedChange={(required) => patchSelected({ required })}
                  />
                </label>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  update(fields.filter((f) => f.id !== selected.id));
                  select(null);
                }}
              >
                <Trash2 /> {t("deleteZone")}
              </Button>
            </aside>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="mx-auto max-w-2xl space-y-6">
            <h1 className="font-display text-2xl font-semibold">
              {isTemplate ? t("reviewTemplate") : t("reviewTitle")}
            </h1>
            <ol className="space-y-2">
              {signers.map((s, i) => (
                <li
                  key={s.key}
                  className="flex items-center gap-3 rounded-2xl border border-border p-4"
                >
                  <span
                    className="flex size-7 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: color(i) }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {isTemplate ? t("role") : [s.email, s.phone].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t("zonesCount", { count: fields.filter((f) => f.signer === i).length })}
                  </span>
                </li>
              ))}
            </ol>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>{signers.length > 1 ? t(`modes.${mode}.title`) : t("singleSigner")}</li>
              {isTemplate ? (
                <li>{t("variablesCount", { count: fields.filter((f) => f.variable).length })}</li>
              ) : (
                <>
                  <li>{t("expires", { count: days })}</li>
                  <li>{t("delivery")}</li>
                </>
              )}
            </ul>
            {isTemplate ? (
              <Button
                size="lg"
                loading={sending}
                onClick={saveAsTemplate}
                className="w-full sm:w-auto"
              >
                <Save /> {t("saveTemplate")}
              </Button>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="lg"
                  loading={sending}
                  onClick={() => submit(false)}
                  className="w-full sm:w-auto"
                >
                  <Send /> {t("send")}
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  disabled={sending}
                  onClick={() => submit(true)}
                  className="w-full sm:w-auto"
                >
                  <Save /> {t("saveDraft")}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
