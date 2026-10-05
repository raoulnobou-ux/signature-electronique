"use client";

import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  Trash2,
  FileDown,
  Mail,
  MessageCircle,
  PencilLine,
  Radio,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  cancelSignatureRequest,
  deleteDraftRequest,
  getRequestFiles,
  getSignerLink,
  remindSigner,
  sendDraftRequest,
} from "@/app/(app)/app/demandes/actions";
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
import { SIGNER_COLORS } from "@/lib/requests/fields";
import { displayRequestStatus } from "@/lib/requests/status";
import { DISPLAY_STATUS_VARIANT, SIGNER_STATUS_VARIANT, type SignerStatus } from "./status";

type Signer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  order: number;
  signedAt: string | null;
  openedAt: string | null;
  declinedReason: string | null;
};

type Props = {
  justSent: boolean;
  request: {
    id: string;
    title: string;
    status: string;
    mode: "sequential" | "parallel";
    documentId: string;
    expiresAt: string | null;
    completedAt: string | null;
    hasCertificate: boolean;
    finalSha256: string | null;
  };
  signers: Signer[];
  events: { id: number; at: string; type: string; actor: string | null }[];
};

const KNOWN_EVENTS = [
  "request.draft_saved",
  "request.created",
  "request.invitation_sent",
  "request.reminder_sent",
  "signer.opened",
  "signer.signed",
  "signer.declined",
  "request.completed",
  "request.canceled",
  "request.expired",
] as const;
type EventKey = {
  [K in (typeof KNOWN_EVENTS)[number]]: K extends `${infer A}.${infer B}` ? `${A}_${B}` : never;
}[(typeof KNOWN_EVENTS)[number]];

export function RequestTracking({ justSent, request, signers, events }: Props) {
  const t = useTranslations("requests");
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const live = request.status === "pending";
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  // Suivi en direct : actualisation discrète tant que la demande est en cours.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(id);
  }, [live, router]);

  const copy = (signer: Signer) =>
    start(async () => {
      const result = await getSignerLink(signer.id);
      if (!result.ok) return void toast.error(t("detail.error"));
      await navigator.clipboard.writeText(result.link).catch(() => undefined);
      toast.success(t("detail.copied"));
    });
  const whatsapp = (signer: Signer) =>
    start(async () => {
      const result = await getSignerLink(signer.id);
      if (result.ok && result.whatsapp) window.open(result.whatsapp, "_blank", "noopener");
      else toast.error(t("detail.error"));
    });
  const remind = (signer: Signer) =>
    start(async () => {
      const result = await remindSigner(signer.id);
      if (result.ok)
        toast.success(result.emailed ? t("detail.reminded") : t("detail.remindedLink"));
      else toast.error(result.error === "too_soon" ? t("detail.tooSoon") : t("detail.error"));
      router.refresh();
    });
  const download = (which: "document" | "certificate") =>
    start(async () => {
      const result = await getRequestFiles(request.id);
      const url = result.ok ? result[which] : null;
      if (url) window.location.assign(url);
      else toast.error(t("detail.error"));
    });
  const cancel = () =>
    start(async () => {
      const result = await cancelSignatureRequest(request.id);
      setConfirmCancel(false);
      if (result.ok) toast.success(t("detail.canceled"));
      else toast.error(t("detail.error"));
      router.refresh();
    });

  const status = displayRequestStatus(request.status, signers);
  const draft = request.status === "draft";
  const sendDraft = () =>
    start(async () => {
      const result = await sendDraftRequest(request.id);
      if (result.ok) {
        toast.success(t("detail.draftSent"));
        router.replace(`/app/demandes/${request.id}?envoyee=1`);
        router.refresh();
      } else
        toast.error(
          result.error === "already_pending"
            ? t("builder.errors.already_pending")
            : t("detail.error"),
        );
    });
  const removeDraft = () =>
    start(async () => {
      const result = await deleteDraftRequest(request.id);
      if (result.ok) {
        toast.success(t("detail.draftDeleted"));
        router.push("/app/demandes");
      } else toast.error(t("detail.error"));
    });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/app/demandes">
            <ArrowLeft /> {t("detail.back")}
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{request.title}</h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <Badge variant={DISPLAY_STATUS_VARIANT[status]}>{t(`status.${status}`)}</Badge>
              <span>{t(`detail.mode.${request.mode}`)}</span>
              {request.completedAt ? (
                <span>{t("detail.completedAt", { date: date(request.completedAt) })}</span>
              ) : request.expiresAt && live ? (
                <span>{t("detail.expires", { date: date(request.expiresAt) })}</span>
              ) : null}
              {live && (
                <span className="inline-flex items-center gap-1 text-success">
                  <Radio className="size-3.5 animate-pulse" aria-hidden /> {t("detail.live")}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {draft && (
              <>
                <Button onClick={sendDraft} loading={pending}>
                  <Send /> {t("detail.sendDraft")}
                </Button>
                <Button asChild variant="secondary">
                  <Link
                    href={`/app/documents/${request.documentId}/demande?brouillon=${request.id}`}
                  >
                    <PencilLine /> {t("detail.editDraft")}
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive"
                  disabled={pending}
                  onClick={removeDraft}
                >
                  <Trash2 /> {t("detail.deleteDraft")}
                </Button>
              </>
            )}
            {status === "signed" && (
              <>
                <Button onClick={() => download("document")} disabled={pending}>
                  <Download /> {t("detail.downloadSigned")}
                </Button>
                {request.hasCertificate && (
                  <Button
                    variant="secondary"
                    onClick={() => download("certificate")}
                    disabled={pending}
                  >
                    <Award /> {t("detail.downloadCertificate")}
                  </Button>
                )}
                <Button asChild variant="ghost">
                  <Link href={`/verify/${request.id}`} target="_blank">
                    <ShieldCheck /> {t("detail.verify")}
                  </Link>
                </Button>
              </>
            )}
            {live && (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={() => setConfirmCancel(true)}
              >
                <XCircle /> {t("detail.cancel")}
              </Button>
            )}
          </div>
        </div>
        {draft && (
          <p className="flex gap-2 rounded-2xl border border-border bg-secondary/50 p-4 text-sm text-muted-foreground">
            <PencilLine className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("detail.draftBanner")}
          </p>
        )}
        {justSent && live && (
          <p
            role="status"
            className="flex gap-2 rounded-2xl border border-success/30 bg-success/10 p-4 text-sm"
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />{" "}
            {t("detail.sentBanner")}
          </p>
        )}
      </div>

      <section aria-labelledby="signers-title" className="space-y-3">
        <h2 id="signers-title" className="font-display text-xl font-semibold">
          {t("detail.signers")}
        </h2>
        <ol className="space-y-3" data-testid="request-signers">
          {signers.map((s, i) => {
            const sStatus = s.status as SignerStatus;
            const actionable = live && s.status !== "signed" && s.status !== "declined";
            return (
              <li
                key={s.id}
                className="rounded-2xl border border-border bg-card p-4"
                data-status={s.status}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: SIGNER_COLORS[i % SIGNER_COLORS.length] }}
                  >
                    {s.order + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[s.email, s.phone].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Badge variant={SIGNER_STATUS_VARIANT[sStatus] ?? "muted"}>
                    {t(`signerStatus.${sStatus}`)}
                  </Badge>
                </div>
                {s.openedAt && !s.signedAt && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Eye className="size-3.5" aria-hidden />{" "}
                    {t("detail.openedAt", { date: date(s.openedAt) })}
                  </p>
                )}
                {s.signedAt && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("detail.signedAt", { date: date(s.signedAt) })}
                  </p>
                )}
                {s.declinedReason && (
                  <p className="mt-2 text-sm text-destructive">
                    {t("detail.declinedReason", { reason: s.declinedReason })}
                  </p>
                )}
                {actionable && (s.status !== "pending" || request.mode === "parallel") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => copy(s)}
                    >
                      <Copy /> {t("detail.copyLink")}
                    </Button>
                    {s.phone && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => whatsapp(s)}
                      >
                        <MessageCircle /> {t("detail.whatsapp")}
                      </Button>
                    )}
                    {(s.status === "sent" || s.status === "opened") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => remind(s)}
                      >
                        <Mail /> {t("detail.remind")}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="timeline-title" className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 id="timeline-title" className="font-display text-xl font-semibold">
            {t("detail.timeline")}
          </h2>
          <Button asChild variant="ghost" size="sm">
            <a href={`/api/requests/${request.id}/audit`} download>
              <FileDown /> {t("detail.exportAudit")}
            </a>
          </Button>
        </div>
        <ol className="space-y-2 border-l border-border pl-4">
          {events.map((e) => (
            <li key={e.id} className="relative text-sm">
              <span
                className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-brand-violet"
                aria-hidden
              />
              <span className="font-medium">
                {KNOWN_EVENTS.includes(e.type as (typeof KNOWN_EVENTS)[number])
                  ? t(`detail.events.${e.type.replace(".", "_") as EventKey}`)
                  : e.type}
              </span>
              {e.actor && <span className="text-muted-foreground"> — {e.actor}</span>}
              <span className="block text-xs text-muted-foreground">{date(e.at)}</span>
            </li>
          ))}
        </ol>
      </section>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("detail.cancelTitle")}</DialogTitle>
            <DialogDescription>{t("detail.cancelBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t("detail.keep")}</Button>
            </DialogClose>
            <Button variant="destructive" loading={pending} onClick={cancel}>
              {t("detail.cancelConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
