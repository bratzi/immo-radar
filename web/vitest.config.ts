import { defineConfig } from "vitest/config";

// Eigene Datei statt eines `test`-Blocks in `vite.config.ts`: Der Blockt
// haengt dort am Vitest-Typ, und `tsc --noEmit` ueber die Vite-Konfiguration
// kennt ihn nicht.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
