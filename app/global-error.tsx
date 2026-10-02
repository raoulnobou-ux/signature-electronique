"use client";

import "./globals.css";
import { ErrorView } from "@/components/errors/error-view";

/** Erreur dans la mise en page racine elle-même : page autonome, sans dépendance. */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="fr">
      <body className="bg-background text-foreground antialiased">
        <ErrorView digest={error.digest} retry={retry} />
      </body>
    </html>
  );
}
