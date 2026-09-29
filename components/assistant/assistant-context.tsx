"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { QuickActionId, TourTarget } from "@/lib/ai/events";

export type AskRequest = {
  message?: string;
  quickAction?: QuickActionId;
  /** Joindre ce document (choix explicite de l'utilisateur = consentement). */
  attach?: { id: string; title: string };
};

type AssistantContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Ouvre le panneau, éventuellement avec une question ou une action à lancer. */
  ask: (request?: AskRequest) => void;
  /**
   * La conversation affichée s'abonne aux demandes ; une demande faite panneau fermé
   * attend son ouverture. Renvoie la fonction de désabonnement.
   */
  onAsk: (listener: (request: AskRequest) => void) => () => void;
  /** Document affiché à l'écran (proposé en pièce jointe, jamais envoyé sans clic). */
  currentDocument: { id: string; title: string } | null;
  setCurrentDocument: (doc: { id: string; title: string } | null) => void;
  highlight: (target: TourTarget) => void;
  pro: boolean;
  /** Messages restants aujourd'hui (null = illimité), partagé par le panneau et la page. */
  remaining: number | null;
  setRemaining: (remaining: number | null) => void;
};

const Ctx = createContext<AssistantContextValue | null>(null);

/** Page où se trouve chaque élément de la visite guidée (s'il n'est pas déjà affiché). */
const TOUR_PAGES: Partial<Record<TourTarget, string>> = {
  import: "/app/documents",
  "new-signature": "/app/signatures",
};

function visible(target: TourTarget): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)];
  return all.find((el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0) ?? null;
}

function pulse(el: HTMLElement) {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("tour-highlight");
  window.setTimeout(() => el.classList.remove("tour-highlight"), 4500);
}

export function AssistantProvider({
  children,
  pro,
  initialRemaining,
}: {
  children: ReactNode;
  pro: boolean;
  initialRemaining: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const pending = useRef<AskRequest | null>(null);
  const listener = useRef<((request: AskRequest) => void) | null>(null);
  const [currentDocument, setCurrentDocument] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [remaining, setRemaining] = useState<number | null>(initialRemaining);

  const highlight = useCallback(
    (target: TourTarget) => {
      // Le panneau se ferme pour laisser voir l'élément montré.
      setOpen(false);
      const el = visible(target);
      if (el) return pulse(el);
      const page = TOUR_PAGES[target];
      if (page && page !== pathname) router.push(page);
      // L'élément apparaît après la navigation : quelques essais.
      let tries = 0;
      const id = window.setInterval(() => {
        const found = visible(target);
        if (found || ++tries > 20) {
          window.clearInterval(id);
          if (found) pulse(found);
        }
      }, 200);
    },
    [pathname, router],
  );

  const ask = useCallback((request?: AskRequest) => {
    setOpen(true);
    if (!request) return;
    if (listener.current) listener.current(request);
    else pending.current = request;
  }, []);

  const onAsk = useCallback((fn: (request: AskRequest) => void) => {
    listener.current = fn;
    const waiting = pending.current;
    pending.current = null;
    if (waiting) fn(waiting);
    return () => {
      if (listener.current === fn) listener.current = null;
    };
  }, []);

  const value = useMemo<AssistantContextValue>(
    () => ({
      open,
      setOpen,
      ask,
      onAsk,
      currentDocument,
      setCurrentDocument,
      highlight,
      pro,
      remaining,
      setRemaining,
    }),
    [open, ask, onAsk, currentDocument, highlight, pro, remaining],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useAssistant hors de AssistantProvider");
  return value;
}

/** Variante tolérante (pages publiques sans assistant). */
export function useOptionalAssistant(): AssistantContextValue | null {
  return useContext(Ctx);
}
