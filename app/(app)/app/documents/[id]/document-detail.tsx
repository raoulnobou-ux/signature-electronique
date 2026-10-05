"use client";

import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  FileSignature,
  Fingerprint,
  History,
  Lock,
  Radio,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { PdfViewer } from "@/components/documents/pdf-viewer";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatBytes } from "@/lib/format";
import { getDocumentFileUrl } from "../actions";

type Detail = {
  id: string;
  title: string;
  status: "draft" | "pending" | "signed" | "declined" | "expired";
  pageCount: number;
  sizeBytes: number;
  createdAt: string;
  originalName: string;
  originalType: string;
  sha256: string | null;
  folderName: string | null;
  trashed: boolean;
  versions: { version: number; sha256: string; createdAt: string; note: string | null }[];
};

export function DocumentDetail({
  doc,
  pdfUrl,
  readOnly,
  pendingRequestId,
  canRequest,
  extraActions,
}: {
  doc: Detail;
  pdfUrl: string;
  readOnly: boolean;
  /** Demande de signature en cours sur ce document (l'édition est alors bloquée). */
  pendingRequestId: string | null;
  canRequest: boolean;
  extraActions?: React.ReactNode;
}) {
  const t = useTranslations("documents");
  const locale = useLocale();
  const format = useFormatter();
  const [copied, setCopied] = useState(false);

  const download = async (which: "pdf" | "original") => {
    const result = await getDocumentFileUrl(doc.id, which, true);
    if (result.ok) window.location.href = result.url;
    else toast.error(t("toasts.error"));
  };

  const types = { pdf: 1, docx: 1, doc: 1, odt: 1, rtf: 1, jpeg: 1, png: 1 } as const;
  const typeLabel =
    doc.originalType in types
      ? t(`types.${doc.originalType as keyof typeof types}`)
      : doc.originalType;

  return (
    <div className="mx-auto max-w-7xl">
      <Link
        href="/app/documents"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t("detail.back")}
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight break-words sm:text-3xl">
            {doc.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge status={doc.status} />
            <span>{t("pages", { count: doc.pageCount })}</span>
            {doc.folderName && <span>· {doc.folderName}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {!doc.trashed && (
            <Button variant="secondary" onClick={() => void download("pdf")}>
              <Download /> {t("actions.download")}
            </Button>
          )}
          {pendingRequestId ? (
            <Button asChild>
              <Link href={`/app/demandes/${pendingRequestId}`}>
                <Radio /> {t("actions.viewRequest")}
              </Link>
            </Button>
          ) : (
            !readOnly &&
            !doc.trashed && (
              <>
                <Button asChild variant="secondary">
                  <Link href={canRequest ? `/app/documents/${doc.id}/demande` : "/app/demandes"}>
                    {canRequest ? <Send /> : <Lock />} {t("actions.request")}
                  </Link>
                </Button>
                <Button asChild>
                  <Link href={`/app/documents/${doc.id}/signer`}>
                    <FileSignature />{" "}
                    {doc.status === "signed" ? t("actions.signAgain") : t("actions.sign")}
                  </Link>
                </Button>
              </>
            )
          )}
          {extraActions}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <PdfViewer source={pdfUrl} className="h-[75dvh] min-h-[420px]" />
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-5">
              <h2 className="font-display text-base font-semibold">{t("detail.info")}</h2>
              <dl className="space-y-3 text-sm">
                <Row label={t("detail.created")}>
                  {format.dateTime(new Date(doc.createdAt), {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </Row>
                <Row label={t("detail.originalName")}>
                  <span className="break-all">{doc.originalName}</span>
                </Row>
                <Row label={t("detail.type")}>{typeLabel}</Row>
                <Row label={t("detail.size")}>{formatBytes(doc.sizeBytes, locale)}</Row>
              </dl>
              {doc.originalType !== "pdf" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3"
                  onClick={() => void download("original")}
                >
                  <Download /> {t("actions.downloadOriginal")}
                </Button>
              )}
            </CardContent>
          </Card>

          {doc.sha256 && (
            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                  <Fingerprint className="size-4 text-accent-foreground" aria-hidden />{" "}
                  {t("detail.fingerprint")}
                </h2>
                <p className="text-xs text-muted-foreground">{t("detail.fingerprintHint")}</p>
                <div className="flex items-start gap-2 rounded-xl bg-secondary p-3">
                  <code className="flex-1 font-mono text-[11px] leading-relaxed break-all">
                    {doc.sha256}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 shrink-0"
                    aria-label={t("detail.copy")}
                    onClick={async () => {
                      await navigator.clipboard.writeText(doc.sha256!);
                      setCopied(true);
                      toast.success(t("detail.copied"));
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? <Check /> : <Copy />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {doc.versions.length > 0 && (
            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                  <History className="size-4 text-accent-foreground" aria-hidden />{" "}
                  {t("detail.versions")}
                </h2>
                <ol className="space-y-3">
                  {doc.versions.map((v) => (
                    <li key={v.version} className="flex gap-3 text-sm">
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-gradient"
                        aria-hidden
                      />
                      <div>
                        <p className="font-medium">
                          {t("detail.version", { n: v.version })}
                          {v.note && (
                            <span className="font-normal text-muted-foreground"> — {v.note}</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format.dateTime(new Date(v.createdAt), {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
