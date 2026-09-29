"use client";

import { History, Loader2, MessageSquarePlus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  deleteConversation,
  listConversations,
  loadConversation,
} from "@/app/(app)/app/assistant/actions";
import { Button } from "@/components/ui/button";
import type { DisplayMessage } from "@/lib/ai/conversations";
import { cn } from "@/lib/utils";
import { Chat } from "./chat";

type Conversation = { id: string; title: string; updatedAt: string };
type Active = { key: string; id: string | null; messages: DisplayMessage[] };

const fresh = (): Active => ({ key: crypto.randomUUID(), id: null, messages: [] });

/** Liste des conversations passées (reprise, suppression). */
function HistoryList({
  items,
  activeId,
  loading,
  onOpen,
  onDelete,
}: {
  items: Conversation[] | null;
  activeId: string | null;
  loading: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations("assistant");
  if (!items) {
    return (
      <div className="flex justify-center p-6">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }
  if (!items.length) return <p className="p-4 text-sm text-muted-foreground">{t("noHistory")}</p>;
  return (
    <ul className="space-y-1 p-2" data-testid="assistant-history">
      {items.map((c) => (
        <li key={c.id} className="group flex items-center gap-1">
          <button
            type="button"
            onClick={() => onOpen(c.id)}
            className={cn(
              "flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-secondary",
              activeId === c.id && "bg-accent",
            )}
          >
            {loading === c.id && <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />}
            <span className="truncate">{c.title}</span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={t("delete")}
            onClick={() => onDelete(c.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Espace de conversation complet : discussion + historique. `panel` : historique en
 * bascule (tiroir, mobile) ; `page` : historique en colonne sur grand écran.
 */
export function AssistantWorkspace({
  userName,
  layout,
  headerExtra,
}: {
  userName: string;
  layout: "panel" | "page";
  headerExtra?: React.ReactNode;
}) {
  const t = useTranslations("assistant");
  const [active, setActive] = useState<Active>(fresh);
  const [showHistory, setShowHistory] = useState(false);
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => setItems(await listConversations()));
  }, []);

  useEffect(() => {
    if (layout === "page" || showHistory) refresh();
  }, [layout, showHistory, refresh]);

  const open = (id: string) => {
    setLoading(id);
    startTransition(async () => {
      const messages = await loadConversation(id);
      setLoading(null);
      if (!messages) return;
      setActive({ key: id, id, messages });
      setShowHistory(false);
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      const { ok } = await deleteConversation(id);
      if (!ok) return;
      toast.success(t("deleted"));
      setItems((list) => list?.filter((c) => c.id !== id) ?? null);
      if (active.id === id) setActive(fresh());
    });
  };

  const toolbar = (
    <div className="flex items-center gap-1">
      {layout === "panel" && (
        <Button
          variant={showHistory ? "secondary" : "ghost"}
          size="icon"
          aria-label={t("history")}
          aria-pressed={showHistory}
          onClick={() => setShowHistory((v) => !v)}
        >
          <History />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("newConversation")}
        onClick={() => {
          setActive(fresh());
          setShowHistory(false);
        }}
      >
        <MessageSquarePlus />
      </Button>
      {headerExtra}
    </div>
  );

  const chat = (
    <Chat
      key={active.key}
      userName={userName}
      conversationId={active.id}
      initialMessages={active.messages}
      onConversation={(id) => {
        setActive((a) => ({ ...a, id }));
        if (layout === "page") refresh();
      }}
      className="min-h-0 flex-1"
    />
  );

  if (layout === "panel") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-end border-b border-border px-3 py-1.5">
          {toolbar}
        </div>
        {showHistory ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <HistoryList
              items={items}
              activeId={active.id}
              loading={loading}
              onOpen={open}
              onDelete={remove}
            />
          </div>
        ) : (
          chat
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-3xl border border-border bg-card">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border md:flex">
        <p className="px-4 pt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("history")}
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <HistoryList
            items={items}
            activeId={active.id}
            loading={loading}
            onOpen={open}
            onDelete={remove}
          />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-end border-b border-border px-3 py-1.5">
          {/* Mobile : l'historique s'ouvre en bascule. */}
          <Button
            variant={showHistory ? "secondary" : "ghost"}
            size="icon"
            className="md:hidden"
            aria-label={t("history")}
            aria-pressed={showHistory}
            onClick={() => setShowHistory((v) => !v)}
          >
            <History />
          </Button>
          {toolbar}
        </div>
        {showHistory ? (
          <div className="min-h-0 flex-1 overflow-y-auto md:hidden">
            <HistoryList
              items={items}
              activeId={active.id}
              loading={loading}
              onOpen={open}
              onDelete={remove}
            />
          </div>
        ) : null}
        <div className={cn("flex min-h-0 flex-1 flex-col", showHistory && "hidden md:flex")}>
          {chat}
        </div>
      </div>
    </div>
  );
}
