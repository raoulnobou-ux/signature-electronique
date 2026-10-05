"use client";

import { useEffect } from "react";
import { syncTimezone } from "@/app/(app)/app/parametres/actions";

/**
 * Compte sans fuseau connu (UTC : inscription Google, comptes anciens) : on enregistre une
 * fois le fuseau de l'appareil, pour dater signatures, e-mails et reçus à l'heure locale.
 */
export function TimezoneSync() {
  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone && timezone !== "UTC") void syncTimezone(timezone);
  }, []);
  return null;
}
