"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Vrai uniquement après l'hydratation (évite les écarts serveur/navigateur, ex. noms de pays localisés). */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
