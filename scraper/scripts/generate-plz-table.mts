import AdmZip from "adm-zip";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BUNDESLAND_NORMALISIERUNG: Record<string, string> = {
  "Bavaria": "Bayern",
  "Bayern": "Bayern",
  "Berlin": "Berlin",
  "Land Berlin": "Berlin",
  "Lower Saxony": "Niedersachsen",
  "Niedersachsen": "Niedersachsen",
  "Mecklenburg-Vorpommern": "Mecklenburg-Vorpommern",
  "Mecklenburg-Western Pomerania": "Mecklenburg-Vorpommern",
  "Saxony": "Sachsen",
  "Sachsen": "Sachsen",
  "Saxony-Anhalt": "Sachsen-Anhalt",
  "Sachsen-Anhalt": "Sachsen-Anhalt",
  "Thuringia": "Thüringen",
  "Thüringen": "Thüringen",
  "Baden-Württemberg": "Baden-Württemberg",
  "Brandenburg": "Brandenburg",
  "Bremen": "Bremen",
  "Hamburg": "Hamburg",
  "Hessen": "Hessen",
  "Nordrhein-Westfalen": "Nordrhein-Westfalen",
  "Rheinland-Pfalz": "Rheinland-Pfalz",
  "Saarland": "Saarland",
  "Schleswig-Holstein": "Schleswig-Holstein",
};

async function main() {
  const res = await fetch("https://download.geonames.org/export/zip/DE.zip");
  if (!res.ok) {
    throw new Error(`GeoNames-Download fehlgeschlagen: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);
  const txt = zip.readAsText("DE.txt");

  const map: Record<string, string> = {};
  for (const line of txt.split("\n")) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    const plz = cols[1];
    const rawState = cols[3];
    const state = BUNDESLAND_NORMALISIERUNG[rawState];
    if (!plz || !state) continue;
    if (!map[plz]) map[plz] = state;
  }

  const anzahl = Object.keys(map).length;
  if (anzahl < 8000) {
    throw new Error(
      `Nur ${anzahl} PLZ-Einträge erzeugt, erwartet >8000 — GeoNames-Format hat sich vermutlich geändert.`
    );
  }

  const outPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "lib",
    "plzBundesland.generated.json"
  );
  writeFileSync(outPath, JSON.stringify(map));
  console.log(`Fertig: ${anzahl} PLZ-Einträge geschrieben nach ${outPath}`);
}

main();
