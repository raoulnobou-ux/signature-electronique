"use client";

import { Bell, Eye, FileCheck2, FilePlus2, FileText, MapPin, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { remindSigner } from "@/app/(app)/app/demandes/actions";
import { createDocumentFromDraft } from "@/app/(app)/app/assistant/actions";
import { Button } from "@/components/ui/button";
import type { AssistantAction } from "@/lib/ai/events";
import { useAssistant } from "./assistant-context";
import { Markdown } from "./markdown";
import { saveAssistantDraft } from "./request-draft";

/** Propositions de l'assistant : l'utilisateur confirme lui-même chaque action. */
export function ActionCard({ action }: { action: AssistantAction }) {
  const t = useTranslations("assistant.actions");
  const router = useRouter();
  const { highlight, setOpen } = useAssistant();
  const [pending, start] = useTransition();
  const [created, setCreated] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const card = "mt-2 space-y-2 rounded-xl border border-border bg-background/60 p-3 text-sm";

  switch (action.kind) {
    case "highlight":
      return (
        <div className={card} data-testid="action-highlight">
          <p className="flex items-center gap-2">
            <MapPin className="size-4 text-brand-violet" aria-hidden /> {action.label}
          </p>
          <Button size="sm" variant="secondary" onClick={() => highlight(action.target)}>
            <Eye /> {t("showAgain")}
          </Button>
        </div>
      );
    case "zones": {
      const pages = new Set(action.zones.map((z) => z.page + 1));
      return (
        <div className={card} data-testid="action-zones">
          <p className="font-medium">{action.summary}</p>
          <p className="text-xs text-muted-foreground">
            {t("zonesDetail", { count: action.zones.length, pages: [...pages].join(", ") || "—" })}
          </p>
          {action.zones.length > 0 && (
            <Button
              size="sm"
              onClick={() => {
                saveAssistantDraft(action.documentId, {
                  signers: [],
                  zones: action.zones,
                  mode: "sequential",
                  message: "",
                });
                setOpen(false);
                router.push(`/app/documents/${action.documentId}/demande?assistant=1`);
              }}
            >
              <Send /> {t("useZones")}
            </Button>
          )}
        </div>
      );
    }
    case "request_draft":
      return (
        <div className={card} data-testid="action-request">
          <p className="font-medium">{t("requestDraft", { count: action.signers.length })}</p>
          <ul className="text-xs text-muted-foreground">
            {action.signers.map((s, i) => (
              <li key={i}>
                {i + 1}. {s.name} {[s.email, s.phone].filter(Boolean).join(" · ")}
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            onClick={() => {
              saveAssistantDraft(action.documentId, {
                signers: action.signers,
                zones: action.zones,
                mode: action.mode,
                message: action.message,
              });
              setOpen(false);
              router.push(`/app/documents/${action.documentId}/demande?assistant=1`);
            }}
          >
            <Send /> {t("openDraft")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("confirmHint")}</p>
        </div>
      );
    case "draft_document":
      return (
        <div className={card} data-testid="action-draft">
          <p className="flex items-center gap-2 font-medium">
            <FileText className="size-4 text-brand-violet" aria-hidden /> {action.title}
          </p>
          <div
            className={
              expanded
                ? ""
                : "max-h-32 overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]"
            }
          >
            <Markdown text={action.body} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setExpanded((e) => !e)}>
              {expanded ? t("collapse") : t("expand")}
            </Button>
            {created ? (
              <Button asChild size="sm">
                <Link href={`/app/documents/${created}`} onClick={() => setOpen(false)}>
                  <FileCheck2 /> {t("openDocument")}
                </Link>
              </Button>
            ) : (
              <Button
                size="sm"
                loading={pending}
                onClick={() =>
                  start(async () => {
                    const result = await createDocumentFromDraft({
                      title: action.title,
                      body: action.body,
                    });
                    if (result.ok) {
                      setCreated(result.documentId);
                      toast.success(t("created"));
                    } else toast.error(t("error"));
                  })
                }
              >
                <FilePlus2 /> {t("createPdf")}
              </Button>
            )}
          </div>
        </div>
      );
    case "documents":
      return (
        <ul className={card} data-testid="action-documents">
          {action.items.map((d) => (
            <li key={d.id}>
              <Link
                href={`/app/documents/${d.id}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 font-medium underline-offset-2 hover:underline"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden /> {d.title}
              </Link>
            </li>
          ))}
        </ul>
      );
    case "remind":
      return (
        <ul className={card} data-testid="action-remind">
          {action.items.map((item) => (
            <li key={item.signerId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                <strong>{item.name}</strong> — {item.documentTitle}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await remindSigner(item.signerId);
                    if (result.ok)
                      toast.success(result.emailed ? t("reminded") : t("remindedLink"));
                    else toast.error(result.error === "too_soon" ? t("tooSoon") : t("error"));
                  })
                }
              >
                <Bell /> {t("remind")}
              </Button>
            </li>
          ))}
        </ul>
      );
  }
}
