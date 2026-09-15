import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Statische Seite, ein Buendel, keine Laufzeitabhaengigkeit von fremden
// Diensten (Nachtrag N5). Keine Proxy-Konfiguration, kein Backend: Die
// Oberflaeche liest genau eine Datei.
export default defineConfig({
  plugins: [react()],
  build: {
    // Der Snapshot liegt in `public/` und wird unveraendert kopiert, nie
    // gebuendelt -- 18,9 MB gehoeren nicht in ein JavaScript-Buendel.
    assetsInlineLimit: 0,
    target: "es2022",
  },
});
