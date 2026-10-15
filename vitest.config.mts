import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    // `server-only` lève une erreur hors de Next.js : on le neutralise pour les tests.
    alias: { "server-only": new URL("./tests/unit/stubs/empty.ts", import.meta.url).pathname },
  },
  test: {
    projects: [
      {
        extends: true,
        // 20 s : sur une machine chargée, le premier import d'un module lourd (pdf.js, registre
        // rechargé par vi.resetModules) dépasse parfois les 5 s par défaut sans être en erreur.
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
          testTimeout: 20_000,
        },
      },
      {
        extends: true,
        // Nécessite Supabase local (npm run db:start) ; ignoré automatiquement sinon.
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
