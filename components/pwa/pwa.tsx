"use client";

import { useEffect, useSyncExternalStore } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Invite d'installation mémorisée dès qu'elle arrive (avant même l'ouverture d'un menu).
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

/** Enregistre le service worker (production uniquement : pas de cache en développement). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      /* navigateur sans service worker : l'application fonctionne normalement */
    });
  }, []);
  return null;
}

export function useInstallPrompt(): (() => Promise<void>) | null {
  const available = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => deferred !== null,
    () => false,
  );
  if (!available) return null;
  return async () => {
    const event = deferred;
    if (!event) return;
    deferred = null;
    notify();
    await event.prompt();
  };
}
