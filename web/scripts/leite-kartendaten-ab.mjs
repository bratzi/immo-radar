/**
 * Leitet ALLE Kartendaten der Oberflaeche AUS REPO-DATEN ab und schreibt sie
 * nach `src/logik/karte.generated.ts`.
 *
 * WARUM ES DIESES SKRIPT GIBT: Der Bau hatte keinen Netzzugang, also gibt es
 * keine Geodaten der Bundeslandgrenzen. Was die Karte zeigt, muss deshalb
 * entweder im Repo liegen oder selbst gezeichnet sein -- und was im Repo
 * liegt, wird herausgezogen statt abgetippt, damit es nicht auseinanderlaeuft.
 *
 * DREI GROESSEN, DREI HERKUENFTE:
 *
 * 1. `UMRISS` -- der vereinfachte Deutschlandumriss aus `scraper/lib/karte.ts`.
 *    Steht dort seit dem Kartenbild der Telegram-Meldung. Echte Geografie.
 *
 * 2. `PLZ_KOORDINATEN` -- Naeherungskoordinaten aller belegten
 *    PLZ-Zweisteller, ebenfalls aus `scraper/lib/karte.ts`. Traegt die
 *    Punktschicht (N2): die 242 Objekte, die ueberhaupt eine PLZ haben.
 *
 * 3. `BUNDESLAND_PUNKTE` -- die Ankerpunkte der 16 Kacheln, abgeleitet:
 *    `scraper/lib/plzBundesland.generated.json` ordnet 10.812 Postleitzahlen
 *    je einem Bundesland zu; der Ankerpunkt ist das arithmetische Mittel der
 *    Zweisteller-Koordinaten aller seiner Postleitzahlen. Jede PLZ zaehlt
 *    einmal, der Punkt ist also nach PLZ-Dichte gewichtet und nicht nach
 *    Flaeche -- gewollt: Er soll dort liegen, wo die Objekte sind.
 *
 *    WAS DAS NICHT HERGIBT: kein Flaechenschwerpunkt, keine Grenze.
 *    Brandenburg umschliesst Berlin; sein PLZ-gewichteter Punkt liegt deshalb
 *    oestlich des wahren Schwerpunkts. Genau darum zeichnet die Oberflaeche
 *    Kacheln und keine Landesflaechen.
 *
 * Aufruf:  npm run ableiten:karte   (aus `web/`)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const hier = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(hier, "..", "..");

const karteQuelle = readFileSync(path.join(repo, "scraper", "lib", "karte.ts"), "utf8");

// --- 1. Umriss -------------------------------------------------------------
const umrissBlock = karteQuelle.split("const UMRISS")[1].split("];")[0];
const umriss = [...umrissBlock.matchAll(/\[(-?[\d.]+),\s*(-?[\d.]+)\]/g)].map((t) => [
  Number(t[1]),
  Number(t[2]),
]);
if (umriss.length < 50) {
  throw new Error(`Nur ${umriss.length} Umrisspunkte gelesen -- karte.ts hat sich geaendert.`);
}

// --- 2. PLZ-Zweisteller ----------------------------------------------------
const plzBlock = karteQuelle.split("const PLZ_KOORDINATEN")[1].split("};")[0];
const koordinaten = new Map();
for (const treffer of plzBlock.matchAll(/"(\d{2})":\s*\[([\d.]+),\s*([\d.]+)\]/g)) {
  koordinaten.set(treffer[1], [Number(treffer[2]), Number(treffer[3])]);
}
if (koordinaten.size < 90) {
  throw new Error(`Nur ${koordinaten.size} PLZ-Zweisteller gelesen -- karte.ts hat sich geaendert.`);
}

// --- 3. Bundesland-Ankerpunkte --------------------------------------------
const plzLand = JSON.parse(
  readFileSync(path.join(repo, "scraper", "lib", "plzBundesland.generated.json"), "utf8")
);

const punkte = new Map();
let ohneKoordinate = 0;
for (const [plz, land] of Object.entries(plzLand)) {
  const eintrag = koordinaten.get(plz.slice(0, 2));
  if (eintrag === undefined) {
    ohneKoordinate += 1;
    continue;
  }
  const bisher = punkte.get(land) ?? { lon: 0, lat: 0, n: 0 };
  bisher.lon += eintrag[0];
  bisher.lat += eintrag[1];
  bisher.n += 1;
  punkte.set(land, bisher);
}
if (punkte.size !== 16) {
  throw new Error(`${punkte.size} Bundeslaender abgeleitet, erwartet werden 16.`);
}

// --- Schreiben -------------------------------------------------------------
const umrissZeilen = [];
for (let i = 0; i < umriss.length; i += 5) {
  umrissZeilen.push(
    "  " +
      umriss
        .slice(i, i + 5)
        .map(([lon, lat]) => `[${lon}, ${lat}]`)
        .join(", ") +
      ","
  );
}

const plzZeilen = [...koordinaten.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([zs, [lon, lat]]) => `  "${zs}": [${lon}, ${lat}],`);

const landZeilen = [...punkte.entries()]
  .sort((a, b) => a[0].localeCompare(b[0], "de"))
  .map(
    ([land, s]) =>
      `  { name: ${JSON.stringify(land)}, lon: ${(s.lon / s.n).toFixed(3)}, lat: ${(
        s.lat / s.n
      ).toFixed(3)}, plzAnzahl: ${s.n} },`
  );

const inhalt = `/**
 * ERZEUGT -- nicht von Hand aendern.
 * Erzeuger: web/scripts/leite-kartendaten-ab.mjs  (npm run ableiten:karte)
 *
 * Quellen: scraper/lib/karte.ts (Umriss, PLZ-Zweisteller) und
 * scraper/lib/plzBundesland.generated.json (Zuordnung PLZ -> Bundesland).
 * Verfahren und Vorbehalte stehen im Erzeuger.
 *
 * Gelesen: ${umriss.length} Umrisspunkte, ${koordinaten.size} PLZ-Zweisteller,
 * ${Object.keys(plzLand).length} Postleitzahlen (davon ${ohneKoordinate} ohne Zweisteller-Koordinate).
 */

/** Vereinfachter Deutschlandumriss als [Laengengrad, Breitengrad]. Echte Geografie. */
export const UMRISS: readonly (readonly [number, number])[] = [
${umrissZeilen.join("\n")}
];

/** Naeherungskoordinaten je PLZ-Zweisteller -- [Laengengrad, Breitengrad]. */
export const PLZ_KOORDINATEN: Readonly<Record<string, readonly [number, number]>> = {
${plzZeilen.join("\n")}
};

export interface BundeslandPunkt {
  name: string;
  /** PLZ-gewichtetes Mittel. KEIN Flaechenschwerpunkt, keine Grenze. */
  lon: number;
  lat: number;
  /** Wie viele Postleitzahlen den Punkt gebildet haben. */
  plzAnzahl: number;
}

export const BUNDESLAND_PUNKTE: readonly BundeslandPunkt[] = [
${landZeilen.join("\n")}
];
`;

const ziel = path.join(hier, "..", "src", "logik", "karte.generated.ts");
writeFileSync(ziel, inhalt, "utf8");
console.log(
  `geschrieben: ${path.relative(repo, ziel)} -- ${umriss.length} Umrisspunkte, ` +
    `${koordinaten.size} PLZ-Zweisteller, ${punkte.size} Bundeslaender ` +
    `(${ohneKoordinate} von ${Object.keys(plzLand).length} PLZ ohne Koordinate)`
);
