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
        test: { name: "unit", environment: "node", include: ["tests/unit/**/*.test.{ts,tsx}"] },
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
