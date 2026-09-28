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
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
  },
});
