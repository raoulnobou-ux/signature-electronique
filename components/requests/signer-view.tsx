"use client";

import {
  ArrowDown,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Hourglass,
  Keyboard,
  Lock,
  PenLine,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { declineSigning, markOpened, submitSigned } from "@/app/s/[token]/actions";
import { Logo } from "@/components/brand/logo";
import { PdfViewer, type PageSize } from "@/components/documents/pdf-viewer";
import { DrawPad, TypePad, type Register } from "@/components/signatures/signature-creator";
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
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { canvasToPngBlob } from "@/lib/images/signature";
import type { RequestFieldType } from "@/lib/requests/fields";
import { cn } from "@/lib/utils";

export type SignerField = {
  id: string;
  type: RequestFieldType;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Libellé (texte), mention, ou valeur calculée (date, nom) pour l'aperçu. */
  value: string | null;
  required: boolean;
};

export type SignerViewState =
  | "ready"
  | "waiting"
  | "signed"
  | "completed"
  | "declined"
  | "expired"
  | "canceled"
  | "closed"
  | "invalid";

type Props = {
  token: string;
  state: SignerViewState;
  signerName: string;
  senderName: string;
  title: string;
  message: string | null;
  expiresAt: string | null;
  pdfUrl: string | null;
  fields: SignerField[];
};

type Ink = { blob: Blob; url: string };
const INK = "#0B1F5C";

export function SignerView(props: Props) {
  const t = useTranslations("sign");
  const [state, setState] = useState<SignerViewState>(props.state);
  const [completed, setCompleted] = useState(props.state === "completed");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (props.state === "ready") void markOpened(props.token);
  }, [props.state, props.token]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Logo className="h-6" />
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" aria-hidden /> {t("secure")}
        </span>
      </header>

      {state === "ready" && started && props.pdfUrl ? (
        <SigningWorkspace
          {...props}
          pdfUrl={props.pdfUrl}
          onDone={(done) => {
            setCompleted(done);
            setState("signed");
          }}
          onDeclined={() => setState("declined")}
        />
      ) : (
        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-lg space-y-6 text-center">
            <StatusScreen
              {...props}
              state={state}
              completed={completed}
              onStart={() => setStarted(true)}
            />
          </div>
        </main>
      )}
    </div>
  );
}

function StatusScreen({
  state,
  completed,
  token,
  signerName,
  senderName,
  title,
  message,
  onStart,
}: Props & { completed: boolean; onStart: () => void }) {
  const t = useTranslations("sign");
  const icon = {
    ready: PenLine,
    waiting: Hourglass,
    signed: CheckCircle2,
    completed: CheckCircle2,
    declined: XCircle,
    expired: Clock,
    canceled: XCircle,
    closed: XCircle,
    invalid: XCircle,
  }[state];
  const Icon = icon;
  const success = state === "signed" || state === "completed";

  return (
    <>
      <div
        className={cn(
          "mx-auto flex size-16 items-center justify-center rounded-2xl text-white shadow-lift",
          success
            ? "bg-success"
            : state === "ready"
              ? "bg-brand-gradient"
              : "bg-secondary text-muted-foreground",
        )}
      >
        <Icon className="size-8" aria-hidden />
      </div>
      {state === "ready" ? (
        <>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("hello", { name: signerName })}</p>
            <h1 className="font-display text-2xl font-semibold text-balance">
              {t("invite", { sender: senderName, title })}
            </h1>
          </div>
          {message && (
            <blockquote className="rounded-2xl border border-border bg-card p-4 text-left text-sm italic">
              « {message} »
              <footer className="mt-2 text-xs text-muted-foreground not-italic">
                — {senderName}
              </footer>
            </blockquote>
          )}
          <ol className="space-y-2 text-left text-sm text-muted-foreground">
            <li>1. {t("steps.read")}</li>
            <li>2. {t("steps.fill")}</li>
            <li>3. {t("steps.sign")}</li>
          </ol>
          <Button size="lg" className="w-full" onClick={onStart}>
            {t("start")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("noAccount")}</p>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-semibold">{t(`states.${state}.title`)}</h1>
          <p className="text-muted-foreground">
            {state === "signed" || state === "completed"
              ? completed || state === "completed"
                ? t("states.completed.body")
                : t("states.signed.body")
              : t(`states.${state}.body`, { sender: senderName })}
          </p>
          {(completed || state === "completed") && (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button asChild>
                <a href={`/s/${token}/document`}>
                  <Download /> {t("download")}
                </a>
              </Button>
              <Button asChild variant="secondary">
                <a href={`/s/${token}/document?fichier=certificat`}>
                  <Award /> {t("certificate")}
                </a>
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function SigningWorkspace({
  token,
  title,
  signerName,
  pdfUrl,
  fields,
  onDone,
  onDeclined,
}: Props & { pdfUrl: string; onDone: (completed: boolean) => void; onDeclined: () => void }) {
  const t = useTranslations("sign");
  const tTools = useTranslations("editor.tools");
  const [signature, setSignature] = useState<Ink | null>(null);
  const [initials, setInitials] = useState<Ink | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.filter((f) => f.type === "checkbox").map((f) => [f.id, "false"])),
  );
  const [pad, setPad] = useState<"signature" | "initials" | null>(null);
  const [editing, setEditing] = useState<SignerField | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [consent, setConsent] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const isDone = (f: SignerField) => {
    if (f.type === "signature") return Boolean(signature);
    if (f.type === "initials") return Boolean(initials);
    if (f.type === "text") return !f.required || Boolean(values[f.id]?.trim());
    if (f.type === "checkbox") return !f.required || values[f.id] === "true";
    return true;
  };
  const interactive = fields.filter((f) =>
    ["signature", "initials", "text", "checkbox"].includes(f.type),
  );
  const remaining = interactive.filter((f) => !isDone(f));
  const ready = remaining.length === 0;

  const activate = (field: SignerField) => {
    if (field.type === "signature" || field.type === "initials") setPad(field.type);
    else if (field.type === "text") setEditing(field);
    else if (field.type === "checkbox")
      setValues((v) => ({ ...v, [field.id]: v[field.id] === "true" ? "false" : "true" }));
  };

  const goToNext = () => {
    const next = remaining[0];
    if (!next) return;
    document
      .querySelector(`[data-field-id="${next.id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const submit = () =>
    start(async () => {
      const form = new FormData();
      form.append("token", token);
      form.append("consent", String(consent));
      if (signature) form.append("signature", signature.blob, "signature.png");
      if (initials) form.append("initials", initials.blob, "initials.png");
      form.append("values", JSON.stringify(values));
      const result = await submitSigned(form);
      if (result.ok) {
        setConfirm(false);
        onDone(result.completed);
      } else toast.error(t(`errors.${result.error}`));
    });

  const decline = () =>
    start(async () => {
      const result = await declineSigning(token, reason);
      if (result.ok) {
        setDeclining(false);
        onDeclined();
      } else toast.error(t("errors.decline"));
    });

  const renderOverlay = (pageIndex: number, size: PageSize) => (
    <div className="absolute inset-0">
      {fields
        .filter((f) => f.page === pageIndex)
        .map((f) => {
          const done = isDone(f);
          const auto = !["signature", "initials", "text", "checkbox"].includes(f.type);
          const fontPx = (f.h / 100) * size.height * 0.62;
          const img =
            f.type === "signature" ? signature?.url : f.type === "initials" ? initials?.url : null;
          return (
            <button
              key={f.id}
              type="button"
              data-field-id={f.id}
              data-field-type={f.type}
              disabled={auto}
              onClick={() => activate(f)}
              aria-label={
                auto
                  ? `${tTools(f.type)} : ${f.value ?? ""}`
                  : done
                    ? t("fieldDone", { field: tTools(f.type) })
                    : t("fieldTodo", { field: tTools(f.type) })
              }
              className={cn(
                "absolute flex items-center justify-center overflow-hidden rounded-[3px] text-[#131722] transition",
                auto
                  ? "cursor-default"
                  : done
                    ? "cursor-pointer ring-1 ring-success/60"
                    : "animate-pulse cursor-pointer border-2 border-dashed border-brand-violet bg-brand-violet/15",
              )}
              style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%` }}
            >
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element -- aperçu local
                <img src={img} alt="" className="size-full object-contain" />
              ) : f.type === "checkbox" ? (
                <span className="flex size-full items-center justify-center border-2 border-slate-900">
                  {values[f.id] === "true" && <Check strokeWidth={3.5} className="size-4/5" />}
                </span>
              ) : f.type === "text" && values[f.id] ? (
                <span
                  className="w-full truncate px-0.5 text-left"
                  style={{ fontSize: fontPx, fontFamily: "Helvetica, Arial, sans-serif" }}
                >
                  {values[f.id]}
                </span>
              ) : auto ? (
                <span
                  className="w-full truncate px-0.5 text-left opacity-70"
                  style={{ fontSize: fontPx, fontFamily: "Helvetica, Arial, sans-serif" }}
                >
                  {f.value}
                </span>
              ) : (
                <span className="px-1 text-[11px] font-semibold text-brand-violet">
                  {f.type === "text"
                    ? f.value || tTools("text")
                    : t("tapHere", { field: tTools(f.type) })}
                </span>
              )}
            </button>
          );
        })}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-2 text-sm">
        <p className="truncate font-semibold">{title}</p>
      </div>
      <div className="relative min-h-0 flex-1">
        <PdfViewer
          source={pdfUrl}
          className="h-[calc(100dvh-10.5rem)]"
          maxPageWidth={900}
          renderOverlay={renderOverlay}
        />
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-border bg-popover px-4 py-3 pb-safe shadow-lift">
        <p className="flex-1 text-sm" aria-live="polite">
          {ready ? t("allDone") : t("remaining", { count: remaining.length })}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setDeclining(true)}>
          {t("decline")}
        </Button>
        {ready ? (
          <Button onClick={() => setConfirm(true)}>
            <PenLine /> {t("finish")}
          </Button>
        ) : (
          <Button variant="secondary" onClick={goToNext}>
            <ArrowDown /> {t("next")}
          </Button>
        )}
      </div>

      <PadDialog
        kind={pad}
        signerName={signerName}
        onClose={() => setPad(null)}
        onValidated={(kind, ink) => {
          if (kind === "signature") setSignature(ink);
          else setInitials(ink);
          setPad(null);
        }}
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.value || tTools("text")}</DialogTitle>
            <DialogDescription>{t("textHint")}</DialogDescription>
          </DialogHeader>
          {editing && (
            <Input
              autoFocus
              aria-label={editing.value || tTools("text")}
              maxLength={200}
              defaultValue={values[editing.id] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [editing.id]: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
            />
          )}
          <DialogFooter>
            <Button onClick={() => setEditing(null)}>{t("ok")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmTitle")}</DialogTitle>
            <DialogDescription>{t("confirmBody")}</DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-3 rounded-2xl border border-border p-4 text-sm">
            <Checkbox
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
              aria-label={t("consent")}
              className="mt-0.5"
            />
            <span>{t("consent")}</span>
          </label>
          <p className="flex gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0" aria-hidden /> {t("evidence")}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("back")}</Button>
            </DialogClose>
            <Button disabled={!consent} loading={pending} onClick={submit}>
              <PenLine /> {t("signNow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={declining} onOpenChange={setDeclining}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("declineTitle")}</DialogTitle>
            <DialogDescription>{t("declineBody")}</DialogDescription>
          </DialogHeader>
          <textarea
            aria-label={t("declineReason")}
            placeholder={t("declineReason")}
            value={reason}
            maxLength={500}
            rows={3}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("back")}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3}
              loading={pending}
              onClick={decline}
            >
              {t("declineConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Signature ou paraphe du signataire : dessin au doigt ou nom tapé en écriture manuscrite. */
function PadDialog({
  kind,
  signerName,
  onClose,
  onValidated,
}: {
  kind: "signature" | "initials" | null;
  signerName: string;
  onClose: () => void;
  onValidated: (kind: "signature" | "initials", ink: Ink) => void;
}) {
  const t = useTranslations("sign");
  const tc = useTranslations("signatures.creator");
  const [method, setMethod] = useState<"draw" | "type">("draw");
  const getImage = useRef<Parameters<Register>[0]>(async () => null);
  const [busy, setBusy] = useState(false);
  const initialsText = signerName
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join(".")
    .concat(".");

  const validate = async () => {
    if (!kind) return;
    setBusy(true);
    try {
      const result = await getImage.current();
      if (!result) return void toast.error(method === "draw" ? tc("draw.empty") : tc("type.empty"));
      const blob = await canvasToPngBlob(result.image.canvas);
      onValidated(kind, { blob, url: result.image.canvas.toDataURL("image/png") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent fullScreenOnMobile className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{kind === "initials" ? t("padInitials") : t("padSignature")}</DialogTitle>
          <DialogDescription>{t("padHint")}</DialogDescription>
        </DialogHeader>
        {kind && (
          <Tabs value={method} onValueChange={(v) => setMethod(v as "draw" | "type")}>
            <TabsList>
              <TabsTrigger value="draw">
                <PenLine aria-hidden /> {tc("tabs.draw")}
              </TabsTrigger>
              <TabsTrigger value="type">
                <Keyboard aria-hidden /> {tc("tabs.type")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="draw">
              {method === "draw" && (
                <DrawPad
                  ink={INK}
                  initials={kind === "initials"}
                  register={(fn) => (getImage.current = fn)}
                />
              )}
            </TabsContent>
            <TabsContent value="type">
              {method === "type" && (
                <TypePad
                  ink={INK}
                  initialText={kind === "initials" ? initialsText : signerName}
                  register={(fn) => (getImage.current = fn)}
                />
              )}
            </TabsContent>
          </Tabs>
        )}
        <DialogFooter>
          <Button size="lg" loading={busy} onClick={() => void validate()}>
            <Check /> {t("usePad")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
