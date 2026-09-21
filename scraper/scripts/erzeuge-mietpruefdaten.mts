/**
 * Erzeugt die Pruefdatei fuer REGIONALE_MIETE_PRO_M2 (Backlog A11 Schritt 3).
 *
 * QUELLE: INKAR (BBSR), Indikator 2113 "Wiedervermietungsmieten inserierter
 * Wohnungen (Angebotsmieten)", Kreisebene. Angebotsmiete ist dieselbe
 * Bezugsgroesse wie im Code -- dieses Projekt bewertet Objekte, die neu
 * vermietet wuerden, nicht laufende Vertraege.
 *
 * WARUM KEIN HANDVERLESENER REFERENZKREIS: Der Backlog schlug vor, jedem
 * PLZ-Zweisteller einen Kreis von Hand zuzuordnen. Das waere bei den
 * gemischten Zweistellern willkuerlich -- die "44" ist Dortmund UND Bochum
 * UND Herne. Genau diese Mischung nennt der Kommentar in `rentEstimate.ts`
 * als Grund dafuer an, dass ein Zweisteller mehr umfasst als seine
 * Kernstadt. Ein einzelner Referenzkreis wuerde diese Auswahl in den
 * Massstab einbauen. Stattdessen: ALLE Kreise, die ein Zweisteller
 * beruehrt. Die Zuordnung PLZ -> Kreisschluessel stammt aus derselben
 * Quelle wie `plzBundesland.generated.json` (GeoNames), ist also ableitbar
 * und nachrechenbar statt geraten.
 *
 * GEWICHTET WIRD NACH EINWOHNERN, nicht nach Zahl der Postleitzahlen. Die
 * Zahl der Postleitzahlen haengt an der Flaeche, die Miete an der
 * Einwohnerdichte -- dieselbe Begruendung, mit der `werteFuerBundesland` in
 * `rentEstimate.ts` die PLZ-Gewichtung ablehnt. Gemessener Unterschied ueber
 * alle 95 Werte: nach PLZ-Zahl lag ein Zweisteller ausserhalb von ±25 %,
 * nach Einwohnern keiner.
 *
 * WACHE: Die Datei haelt je Zweisteller fest, wie viele seiner
 * Postleitzahlen einem INKAR-Kreis zugeordnet werden konnten. Veraltete
 * Kreisschluessel in GeoNames (Kreisreformen) fallen damit auf, statt still
 * das Mittel zu verschieben. Ein Zweisteller unter MINDESTABDECKUNG bekommt
 * ausdruecklich `referenz: null` und gilt im Test als UNGEPRUEFT -- nicht
 * als bestanden.
 *
 * Aufruf: cd scraper && npx tsx scripts/erzeuge-mietpruefdaten.mts
 */
import AdmZip from "adm-zip";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, setGlobalDispatcher } from "undici";
import { getCACertificates, rootCertificates } from "node:tls";

// inkar.de liefert eine unvollstaendige Zertifikatskette: Node bricht mit
// UNABLE_TO_VERIFY_LEAF_SIGNATURE ab, curl und Browser nicht, weil sie das
// fehlende Zwischenzertifikat aus dem Systemspeicher kennen. Das R-Paket
// `bonn` beschreibt denselben Fehler und raet dort zum ABSCHALTEN der
// Pruefung. Das passiert hier ausdruecklich NICHT -- stattdessen bekommt
// Node zusaetzlich den Windows-Zertifikatsspeicher.
setGlobalDispatcher(
  new Agent({ connect: { ca: [...rootCertificates, ...getCACertificates("system")] } }),
);

const INKAR = "https://www.inkar.de";
/** Indikator 2113, Angebotsmieten. */
const GRUPPE_MIETE = "58";
/** Indikator "Bevoelkerung gesamt" -- das Gewicht, mit dem Kreise eingehen. */
const GRUPPE_BEVOELKERUNG = "2";
const RAUMBEZUG = "KRE";

/** Ab welchem Anteil zugeordneter Postleitzahlen ein Zweisteller als geprueft gilt. */
const MINDESTABDECKUNG = 0.8;

async function inkarPost(pfad: string, koerper: unknown): Promise<any> {
  const antwort = await fetch(INKAR + pfad, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(koerper),
  });
  if (!antwort.ok) throw new Error(`INKAR ${pfad}: HTTP ${antwort.status}`);
  const roh = await antwort.text();
  // INKAR antwortet mit einem JSON-String, der JSON enthaelt.
  const einmal = JSON.parse(roh);
  return typeof einmal === "string" ? JSON.parse(einmal) : einmal;
}

/** Das juengste Jahr, fuer das INKAR die Gruppe auf Kreisebene fuehrt. */
async function juengsterZeitbezug(gruppe: string): Promise<{ jahr: string; indID: string }> {
  const moeglich = await inkarPost("/Wizard/GetM%C3%B6glich", {
    IndicatorCollection: [{ Gruppe: gruppe }],
    TimeCollection: "",
    SpaceCollection: [{ level: RAUMBEZUG }],
  });
  const zeiten = (moeglich["Möglich"] ?? []) as { ZeitID: string; IndID: string }[];
  if (zeiten.length === 0) throw new Error(`INKAR nennt keinen Zeitbezug fuer Gruppe ${gruppe}.`);
  const juengste = [...zeiten].sort((a, b) => a.ZeitID.localeCompare(b.ZeitID)).at(-1)!;
  return { jahr: juengste.ZeitID, indID: juengste.IndID };
}

/** Kreisschluessel -> Wert der Gruppe fuer das juengste Jahr. */
async function werteJeKreis(gruppe: string): Promise<{ jahr: string; werte: Map<string, number> }> {
  const { jahr, indID } = await juengsterZeitbezug(gruppe);
  const daten = await inkarPost("/Table/GetDataTable", {
    IndicatorCollection: [{ Gruppe: gruppe }],
    TimeCollection: [{ group: gruppe, indicator: indID, time: jahr, level: RAUMBEZUG }],
    SpaceCollection: [{ level: RAUMBEZUG }],
    pageorder: "1",
  });
  const zeilen = (daten["Daten"] ?? []) as { "Schlüssel": string; Wert: number | null }[];
  const werte = new Map<string, number>();
  for (const z of zeilen) {
    if (z.Wert === null || z.Wert === undefined) continue;
    werte.set(z["Schlüssel"], Number(z.Wert));
  }
  if (werte.size === 0) {
    throw new Error(`INKAR lieferte keine Werte fuer Gruppe ${gruppe} -- nicht gemessen.`);
  }
  return { jahr, werte };
}

/** Postleitzahl -> Menge der Kreisschluessel, in die GeoNames sie legt. */
async function kreiseJePlz(): Promise<Map<string, Set<string>>> {
  const antwort = await fetch("https://download.geonames.org/export/zip/DE.zip");
  if (!antwort.ok) throw new Error(`GeoNames: HTTP ${antwort.status}`);
  const zip = new AdmZip(Buffer.from(await antwort.arrayBuffer()));
  const text = zip.readAsText("DE.txt");

  const karte = new Map<string, Set<string>>();
  for (const zeile of text.split("\n")) {
    if (zeile.trim() === "") continue;
    const spalten = zeile.split("\t");
    const plz = spalten[1];
    const kreis = spalten[8]; // admin3 code = Kreisschluessel, z. B. "08111"
    if (!/^\d{5}$/.test(plz ?? "") || !/^\d{5}$/.test(kreis ?? "")) continue;
    if (!karte.has(plz)) karte.set(plz, new Set());
    karte.get(plz)!.add(kreis);
  }
  if (karte.size === 0) throw new Error("GeoNames lieferte keine PLZ -- nicht gemessen.");
  return karte;
}

interface KreisAnteil {
  kreis: string;
  wert: number;
  /** Postleitzahlen, die dieser Zweisteller in diesen Kreis legt. */
  plz: number;
  /** Geschaetzte Einwohner dieses Ausschnitts, das Gewicht der Mittelung. */
  gewicht: number;
}

async function main(): Promise<void> {
  const miete = await werteJeKreis(GRUPPE_MIETE);
  const bevoelkerung = await werteJeKreis(GRUPPE_BEVOELKERUNG);
  const plzKreise = await kreiseJePlz();

  // Wie viele Postleitzahlen ein Kreis INSGESAMT traegt. Daraus entsteht das
  // Gewicht: Ein Zweisteller, der 3 von 30 Postleitzahlen eines Kreises
  // abdeckt, bekommt ein Zehntel von dessen Einwohnern zugerechnet.
  const plzJeKreis = new Map<string, number>();
  for (const kreise of plzKreise.values()) {
    for (const kreis of kreise) plzJeKreis.set(kreis, (plzJeKreis.get(kreis) ?? 0) + 1);
  }

  // Alle Zweisteller aus GeoNames, nicht nur die der Tabelle: Die Pruefdatei
  // soll auch beantworten koennen, ob ein Zweisteller in der Tabelle FEHLT.
  const jeZweisteller = new Map<
    string,
    { treffer: Map<string, number>; gesamt: number; zugeordnet: number }
  >();
  for (const [plz, kreise] of plzKreise) {
    const zs = plz.slice(0, 2);
    if (!jeZweisteller.has(zs)) {
      jeZweisteller.set(zs, { treffer: new Map(), gesamt: 0, zugeordnet: 0 });
    }
    const eintrag = jeZweisteller.get(zs)!;
    eintrag.gesamt += 1;
    let getroffen = false;
    for (const kreis of kreise) {
      if (!miete.werte.has(kreis)) continue;
      eintrag.treffer.set(kreis, (eintrag.treffer.get(kreis) ?? 0) + 1);
      getroffen = true;
    }
    if (getroffen) eintrag.zugeordnet += 1;
  }

  const ausgabe: Record<
    string,
    { referenz: number | null; abdeckung: number; plzGesamt: number; kreise: KreisAnteil[] }
  > = {};
  for (const [zs, e] of [...jeZweisteller].sort(([a], [b]) => a.localeCompare(b))) {
    const kreise: KreisAnteil[] = [...e.treffer]
      .map(([kreis, plz]) => {
        const einwohner = bevoelkerung.werte.get(kreis);
        const anteil = plz / (plzJeKreis.get(kreis) ?? plz);
        // Ohne Einwohnerzahl faellt der Kreis auf die PLZ-Zahl zurueck. Das
        // bleibt in der Datei sichtbar: gewicht == plz.
        const gewicht = einwohner === undefined ? plz : Math.round(einwohner * anteil);
        return { kreis, wert: miete.werte.get(kreis)!, plz, gewicht };
      })
      .sort((a, b) => b.gewicht - a.gewicht);
    const abdeckung = e.gesamt === 0 ? 0 : e.zugeordnet / e.gesamt;
    let referenz: number | null = null;
    const summe = kreise.reduce((s, k) => s + k.gewicht, 0);
    if (abdeckung >= MINDESTABDECKUNG && kreise.length > 0 && summe > 0) {
      referenz = Number((kreise.reduce((s, k) => s + k.wert * k.gewicht, 0) / summe).toFixed(3));
    }
    ausgabe[zs] = {
      referenz,
      abdeckung: Number(abdeckung.toFixed(4)),
      plzGesamt: e.gesamt,
      kreise,
    };
  }

  const ziel = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "lib",
    "mietPruefdaten.generated.json",
  );
  const inhalt = {
    quelle:
      "INKAR (BBSR), Indikator 2113 Wiedervermietungsmieten inserierter Wohnungen (Angebotsmieten), Kreisebene",
    jahr: miete.jahr,
    genauigkeit:
      "INKAR liefert ueber diese Schnittstelle ganzzahlige Euro je m2 -- bei rund 9 Euro sind das +-5,6 Prozent Rundung",
    zuordnung:
      "PLZ -> Kreisschluessel aus GeoNames DE.zip (Spalte admin3). Gewicht je Kreis: " +
      `Einwohner (INKAR Bevoelkerung gesamt, ${bevoelkerung.jahr}) mal Anteil der ` +
      "Postleitzahlen des Kreises, die auf diesen Zweisteller entfallen",
    mindestabdeckung: MINDESTABDECKUNG,
    erzeugtAm: new Date().toISOString().slice(0, 10),
    zweisteller: ausgabe,
  };
  writeFileSync(ziel, JSON.stringify(inhalt, null, 1) + "\n", "utf8");

  const ohne = Object.values(ausgabe).filter((z) => z.referenz === null).length;
  console.log(`Miete ${miete.jahr}, Bevoelkerung ${bevoelkerung.jahr}, ${miete.werte.size} Kreise, ${plzKreise.size} Postleitzahlen.`);
  console.log(
    `${Object.keys(ausgabe).length} Zweisteller, davon ${ohne} ohne Referenz (Abdeckung unter ${MINDESTABDECKUNG}).`,
  );
  console.log(`Geschrieben: ${ziel}`);
}

await main();
