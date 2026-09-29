"use client";

import { ArrowUp, FileText, Loader2, Paperclip, Sparkles, Square, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  QUICK_ACTIONS,
  SUGGESTIONS,
  suggestionText,
  type AssistantAction,
  type AssistantErrorCode,
  type AssistantEvent,
  type QuickActionId,
  type SuggestionId,
} from "@/lib/ai/events";
import type { DisplayMessage } from "@/lib/ai/conversations";
import { cn } from "@/lib/utils";
import { ActionCard } from "./action-cards";
import { useAssistant, type AskRequest } from "./assistant-context";
import { Markdown } from "./markdown";

type UIMessage = DisplayMessage & {
  tool?: string | null;
  error?: AssistantErrorCode | null;
  streaming?: boolean;
};

const TOOL_NAMES = [
  "show_in_app",
  "find_document",
  "get_document_details",
  "propose_signature_zones",
  "prepare_signature_request",
  "draft_document",
  "list_pending_signatures",
  "explain_certificate",
] as const;
function isToolName(name: string): name is (typeof TOOL_NAMES)[number] {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

type SendInput = {
  message?: string;
  suggestion?: SuggestionId;
  quickAction?: QuickActionId;
  label: string;
};

export function Chat({
  userName,
  conversationId: initialConversationId = null,
  initialMessages = [],
  onConversation,
  className,
}: {
  userName: string;
  conversationId?: string | null;
  initialMessages?: DisplayMessage[];
  onConversation?: (id: string) => void;
  className?: string;
}) {
  const t = useTranslations("assistant");
  const locale = useLocale();
  const pathname = usePathname();
  const { currentDocument, onAsk, highlight, pro, remaining, setRemaining } = useAssistant();
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [attached, setAttached] = useState<{ id: string; title: string } | null>(null);
  const sentDocs = useRef(new Set<string>());
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const patchLast = (patch: (m: UIMessage) => UIMessage) =>
    setMessages((list) => {
      const last = list.at(-1);
      return last?.role === "assistant" ? [...list.slice(0, -1), patch(last)] : list;
    });

  const send = useCallback(
    async (payload: SendInput, attach: { id: string; title: string } | null = attached) => {
      if (streaming) return;
      const newDoc = attach && !sentDocs.current.has(attach.id) ? attach : null;
      const userMessage: UIMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: payload.label,
        actions: [],
        document: newDoc?.title ?? null,
      };
      const assistant: UIMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "",
        actions: [],
        document: null,
        streaming: true,
      };
      setMessages((list) => [...list, userMessage, assistant]);
      setStreaming(true);
      const controller = new AbortController();
      abort.current = controller;
      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversationId ?? undefined,
            message: payload.message,
            suggestion: payload.suggestion,
            quickAction: payload.quickAction,
            documentId: newDoc?.id,
            path: pathname,
          }),
          signal: controller.signal,
        });
        if (!response.body) throw new Error("network");
        if (newDoc) sentDocs.current.add(newDoc.id);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as AssistantEvent;
            if (event.type === "meta") {
              if (!conversationId) {
                setConversationId(event.conversationId);
                onConversation?.(event.conversationId);
              }
            } else if (event.type === "text")
              patchLast((m) => ({ ...m, text: m.text + event.delta, tool: null }));
            else if (event.type === "tool")
              patchLast((m) => ({ ...m, tool: event.status === "start" ? event.name : null }));
            else if (event.type === "action") {
              patchLast((m) => ({ ...m, actions: [...m.actions, event.action] }));
              if (event.action.kind === "highlight") highlight(event.action.target);
            } else if (event.type === "error")
              patchLast((m) => ({ ...m, error: event.code, tool: null }));
            else if (event.type === "done") setRemaining(event.remaining);
          }
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") patchLast((m) => ({ ...m, error: "server" }));
      } finally {
        patchLast((m) => ({ ...m, streaming: false, tool: null }));
        setStreaming(false);
        abort.current = null;
      }
    },
    [attached, conversationId, highlight, onConversation, pathname, streaming, setRemaining],
  );

  // Question ou action demandée depuis ailleurs (fiche document, palette ⌘K).
  const handleAsk = useRef<(request: AskRequest) => void>(() => {});
  useEffect(() => {
    handleAsk.current = (request) => {
      let attach = attached;
      if (request.attach && pro) {
        attach = request.attach;
        setAttached(request.attach);
      }
      if (request.quickAction && attach)
        void send(
          { quickAction: request.quickAction, label: t(`quick.${request.quickAction}`) },
          attach,
        );
      else if (request.message)
        void send({ message: request.message, label: request.message }, attach);
    };
  });
  useEffect(() => onAsk((request) => handleAsk.current(request)), [onAsk]);

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    void send({ message: text, label: text });
  };

  const canAttach = currentDocument && !attached;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
        aria-live="polite"
        data-testid="assistant-messages"
      >
        {messages.length === 0 && (
          <div className="space-y-4 py-6 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-lift">
              <Sparkles className="size-6" aria-hidden />
            </div>
            <p className="font-display text-lg font-semibold">
              {t("emptyTitle", { name: userName.split(" ")[0] ?? "" })}
            </p>
            <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {(Object.keys(SUGGESTIONS) as SuggestionId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={streaming}
                  onClick={() => void send({ suggestion: id, label: suggestionText(id, locale) })}
                  className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-brand-violet hover:bg-accent"
                >
                  {t(`suggestions.${id}`)}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-auto max-w-[85%] space-y-1" data-role="user">
              {m.document && (
                <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                  <FileText className="size-3.5" aria-hidden /> {m.document}
                </p>
              )}
              <div className="rounded-2xl rounded-br-md bg-brand-gradient px-3.5 py-2 text-sm whitespace-pre-wrap text-white">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={m.id} className="max-w-[92%]" data-role="assistant">
              <div className="rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2.5">
                {m.text ? (
                  <Markdown text={m.text} />
                ) : (
                  m.streaming &&
                  !m.error && <p className="text-sm text-muted-foreground">{t("thinking")}</p>
                )}
                {m.tool && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    {isToolName(m.tool) ? t(`tools.${m.tool}`) : m.tool}
                  </p>
                )}
                {m.error && (
                  <p className="text-sm text-destructive" role="alert">
                    {t(`errors.${m.error}`)}
                  </p>
                )}
                {m.actions.map((action: AssistantAction, i) => (
                  <ActionCard key={i} action={action} />
                ))}
              </div>
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>

      <div className="space-y-2 border-t border-border p-3">
        {attached ? (
          <div className="space-y-2">
            <p className="flex items-center gap-2 rounded-xl bg-accent px-3 py-1.5 text-xs text-accent-foreground">
              <FileText className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {t("attached", { title: attached.title })}
              </span>
              <button
                type="button"
                aria-label={t("detach")}
                onClick={() => setAttached(null)}
                className="cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(QUICK_ACTIONS) as QuickActionId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={streaming}
                  onClick={() => void send({ quickAction: id, label: t(`quick.${id}`) })}
                  className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-xs font-medium hover:border-brand-violet hover:bg-accent disabled:opacity-50"
                >
                  {t(`quick.${id}`)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          canAttach && (
            <button
              type="button"
              onClick={() => pro && setAttached(currentDocument)}
              disabled={!pro}
              title={pro ? t("attachHint") : t("attachPro")}
              className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-3 py-1.5 text-left text-xs text-muted-foreground hover:border-brand-violet disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Paperclip className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{t("attach", { title: currentDocument.title })}</span>
            </button>
          )
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            aria-label={t("placeholder")}
            placeholder={t("placeholder")}
            value={input}
            rows={1}
            maxLength={4000}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {streaming ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              aria-label={t("stop")}
              onClick={() => abort.current?.abort()}
            >
              <Square />
            </Button>
          ) : (
            <Button type="submit" size="icon" aria-label={t("send")} disabled={!input.trim()}>
              <ArrowUp />
            </Button>
          )}
        </form>
        <p className="text-center text-[11px] text-muted-foreground">
          {remaining !== null ? `${t("remaining", { count: remaining })} · ` : ""}
          {t("disclaimer")}
        </p>
      </div>
    </div>
  );
}
