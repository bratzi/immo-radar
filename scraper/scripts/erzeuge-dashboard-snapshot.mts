/**
 * NUR LESEND. Erzeugt einen frischen Snapshot gegen die Produktionsdatenbank,
 * ohne zu scrapen -- fuer lokale Entwicklung und den Dashboard-Deploy-Workflow
 * (.github/workflows/deploy-dashboard.yml). Kein Lauf -> Laufkennwerte
 * unbekannt -> null, nicht 0 (siehe erzeugeSnapshot in lib/snapshotDb.ts).
 *
 * Aufruf: cd scraper && npx tsx scripts/erzeuge-dashboard-snapshot.mts [ZIEL]
 * ZIEL default: ../web/public/dashboard-snapshot.json
 */
import { sb } from "../lib/supabase.js";
import { erzeugeSnapshot } from "../lib/snapshotDb.js";

const ziel = process.argv[2] ?? "../web/public/dashboard-snapshot.json";

const ergebnis = await erzeugeSnapshot(
  sb,
  { id: null, beendetAm: null },
  { uebersprungeneJeLauf: null, meldebudget: null },
  new Date(),
  ziel
);
console.log(
  `Snapshot geschrieben: ${ergebnis.pfad} — ${ergebnis.objekte} Objekte, ` +
    `${(ergebnis.bytes / 1_048_576).toFixed(2)} MB (${ergebnis.bytes} Bytes).`
);
