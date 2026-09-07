import * as cheerio from "cheerio";

export interface ZvgDetailData {
  externalId: string;
  url: string;
  title: string;
  caseNumber: string;
  court: string;
  priceCents: number;
  auctionAt: string | null;
  zipCode: string;
  city: string;
  units: number | null;
  unitsConfident: boolean;
  livingAreaM2: number | null;
  yearBuilt: number | null;
  rawNoticeText: string;
  /** Beim Parsen festgestellte Luecken, z. B. "location_unconfirmed". */
  dataGaps: string[];
  /** PDF-Anhaenge (amtliche Bekanntmachung, Expose). Nur MIT Referer abrufbar. */
  attachments: ZvgAttachment[];
}

export interface ZvgAttachment {
  url: string;
  filename: string;
}

interface ZvgDetailKontext {
  externalId: string;
  url: string;
  court: string;
  caseNumber: string;
}

/**
 * Ab dieser Einheitenzahl gilt eine aus dem Beschreibungstext abgeleitete Zahl
 * als bestaetigt. Spiegelt MIN_EINHEITEN aus lib/pipeline.ts -- bewusst lokal
 * dupliziert, damit der reine Parser nicht von der Pipeline abhaengt.
 */
const MIN_EINHEITEN_FUER_BESTAETIGUNG = 3;

const OBJEKT_LAGE_PATTERN = /^(.+?):\s*(.+),\s*(\d{5})\s+(.+)$/;
/** Auffanglinie fuer mehrzeilige Objekt/Lage-Zellen: PLZ + Ort irgendwo im Text. */
const PLZ_ORT_FALLBACK_PATTERN = /(\d{5})\s+([^\n,]+)/;
const UNIT_COUNT_PATTERN = /(\d+)\s*(?:Wohneinheiten|WE\b|Parteien|Wohnungen)/i;
const UNIT_WORD_PATTERN = /(?<![A-Za-zÄÖÜäöüß])(ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)familien(?:wohn)?haus/i;
const UNIT_WORDS: Record<string, number> = {
  ein: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
};
// Wohnflaeche: beide Wortstellungen (Wert-vor-Label und Label-vor-Wert),
// Einheiten qm/m²/m2, Label Wohnfl. / Wohnfläche / Wohnflaeche.
// Der Treffer-Helfer liefert immer Gruppe 1 als Zahl.
const WOHNFLAECHE_PATTERNS = [
  /(\d+(?:[.,]\d+)?)\s*(?:qm|m²|m2)\s*(?:gr(?:o|ö)(?:ss|ß)e\s*)?Wohnfl(?:\.|(?:ä|ae)che)/i,
  /Wohnfl(?:\.|(?:ä|ae)che)\s*:?\s*(?:von\s*)?(?:ca\.?\s*|rund\s*|etwa\s*)?(\d+(?:[.,]\d+)?)\s*(?:qm|m²|m2)/i,
];
// Baujahr: "Bj. 1937", "Bj 1937", "Baujahr 1937", "Baujahr: 1937",
// "erbaut 1937", "erbaut um 1937", "erbaut im Jahre 1937".
const BAUJAHR_PATTERNS = [
  /(?:Baujahr|Bj)\.?\s*:?\s*(\d{4})/i,
  /erbaut\s+(?:um\s+|ca\.?\s+|im\s+Jahr(?:e)?\s+)?(\d{4})/i,
];
const TERMIN_PATTERN = /(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s+(\d{4}),\s*(\d{1,2}):(\d{2})\s*Uhr/;
const GERMAN_MONTHS: Record<string, number> = {
  Januar: 1,
  Februar: 2,
  März: 3,
  April: 4,
  Mai: 5,
  Juni: 6,
  Juli: 7,
  August: 8,
  September: 9,
  Oktober: 10,
  November: 11,
  Dezember: 12,
};

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Deutscher Geldbetrag, gefolgt von einer Waehrungsangabe -- z. B.
 * "605.000,00 €", "89.000,00 EUR", "353.000,-€", "25.000,00 Euro".
 */
const BETRAG_PATTERN = /(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2})|,-)?\s*(?:€|EUR|Euro)/gi;

/** Geldbetrag ohne Waehrungsangabe, an den Nachkommastellen erkennbar. */
const BETRAG_OHNE_WAEHRUNG_PATTERN = /(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})(?!\d)/g;

/**
 * Liest den Verkehrswert aus dem Feldtext. Das Portal setzt haeufig Text um
 * den Betrag ("Grundbuch von X Blatt 3713 lfd.Nr. 1: 605.000,00 €",
 * "543.000,00 € (Kassenzeichen: 040031701069)"). Es wird deshalb gezielt ein
 * Betrag MIT Waehrungsangabe gesucht statt alle Ziffern einzusammeln -- das
 * klebte sonst Fremdziffern an den Wert (Blatt-Nummer + Betrag ergaben
 * 37.131.605.000 statt 605.000).
 *
 * Stehen mehrere Betraege da (Aufteilung nach lfd. Nummern), gewinnt der
 * groesste: das ist der Gesamt-Verkehrswert des Objekts.
 */
function parseVerkehrswert(text: string): number {
  const betraege: number[] = [];
  for (const treffer of text.matchAll(BETRAG_PATTERN)) {
    const ganz = treffer[1].replace(/\./g, "");
    const nachkomma = treffer[2] ?? "0";
    betraege.push(parseFloat(`${ganz}.${nachkomma}`));
  }
  if (betraege.length > 0) return Math.max(...betraege);

  // Ohne Waehrungszeichen (die steht schon im Feldnamen "Verkehrswert in €"):
  // Betraege an den Nachkommastellen erkennen. Aktenzeichen, Blatt- und
  // laufende Nummern tragen nie welche -- ein sicheres Unterscheidungsmerkmal.
  for (const treffer of text.matchAll(BETRAG_OHNE_WAEHRUNG_PATTERN)) {
    betraege.push(parseFloat(`${treffer[1].replace(/\./g, "")}.${treffer[2]}`));
  }
  if (betraege.length > 0) return Math.max(...betraege);

  // Letzter Fall: der gesamte Text ist eine blanke Zahl ohne Nachkommastellen.
  const blank = text.trim().match(/^(\d{1,3}(?:\.\d{3})*|\d+)$/);
  return blank ? parseFloat(blank[1].replace(/\./g, "")) : NaN;
}

function zellenText($: cheerio.CheerioAPI, zelle: cheerio.Cheerio<any>): string {
  const absaetze = zelle.find("p");
  if (absaetze.length > 0) {
    return absaetze
      .toArray()
      .map((p) => normalizeWhitespace($(p).text()))
      .filter((text) => text.length > 0)
      .join("\n");
  }
  return normalizeWhitespace(zelle.text());
}

/** Probiert die Muster der Reihe nach und liefert Gruppe 1 des ersten Treffers. */
function ersteTrefferGruppe(text: string, muster: RegExp[]): string | null {
  for (const regex of muster) {
    const treffer = text.match(regex);
    if (treffer) return treffer[1];
  }
  return null;
}

function parseGermanNumber(text: string): number {
  const cleaned = text.replace(/[^\d,]/g, "").replace(",", ".");
  return parseFloat(cleaned);
}

function parseUnits(text: string): { units: number | null; unitsConfident: boolean } {
  const zahlMatch = text.match(UNIT_COUNT_PATTERN);
  if (zahlMatch) {
    return { units: parseInt(zahlMatch[1], 10), unitsConfident: true };
  }
  const wortMatch = text.match(UNIT_WORD_PATTERN);
  if (wortMatch) {
    const zahl = UNIT_WORDS[wortMatch[1].toLowerCase()];
    if (zahl !== undefined) {
      return { units: zahl, unitsConfident: true };
    }
  }
  return { units: null, unitsConfident: false };
}

function parseTerminZuUtcIso(text: string): string | null {
  const match = text.match(TERMIN_PATTERN);
  if (!match) return null;
  const [, tagText, monatName, jahrText, stundeText, minuteText] = match;
  const monat = GERMAN_MONTHS[monatName as keyof typeof GERMAN_MONTHS];
  if (!monat) return null;
  const tag = parseInt(tagText, 10);
  const jahr = parseInt(jahrText, 10);
  const stunde = parseInt(stundeText, 10);
  const minute = parseInt(minuteText, 10);

  for (const offsetStunden of [2, 1]) {
    const kandidat = new Date(Date.UTC(jahr, monat - 1, tag, stunde - offsetStunden, minute));
    const formatiert = new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(kandidat);
    const erwartet = `${String(tag).padStart(2, "0")}.${String(monat).padStart(2, "0")}.${jahr}, ${String(
      stunde
    ).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    if (formatiert === erwartet) return kandidat.toISOString();
  }
  return new Date(Date.UTC(jahr, monat - 1, tag, stunde - 2, minute)).toISOString();
}

export function parseZvgDetailPage(html: string, kontext: ZvgDetailKontext): ZvgDetailData {
  const $ = cheerio.load(html);
  const zeilen = $("#anzeige > tbody > tr").toArray();

  const felder: { label: string; wert: string }[] = [];
  let verkehrswertText = "";
  let terminText = "";
  let objektLageText = "";
  let beschreibungText = "";

  for (const zeile of zeilen.slice(1)) {
    const tds = $(zeile).find("td");
    if (tds.length < 2) continue;
    const rawLabel = normalizeWhitespace($(tds[0]).text());
    if (!rawLabel || /^amtliche bekanntmachung/i.test(rawLabel)) continue;
    const label = rawLabel.replace(/:$/, "");
    const wert = zellenText($, $(tds[1]));
    felder.push({ label, wert });
    if (label === "Verkehrswert in €") verkehrswertText = wert;
    if (label === "Termin") terminText = wert;
    if (label === "Objekt/Lage") objektLageText = wert;
    if (label === "Beschreibung") beschreibungText = wert;
  }

  const dataGaps: string[] = [];

  // Objekt/Lage kann ueber mehrere Absaetze gehen -- dann greift das
  // ^...$-Muster nicht und wir suchen PLZ + Ort im gesamten Zellentext.
  const objektMatch = objektLageText.match(OBJEKT_LAGE_PATTERN);
  const fallbackMatch = objektMatch ? null : objektLageText.match(PLZ_ORT_FALLBACK_PATTERN);
  const zipCode = objektMatch ? objektMatch[3] : fallbackMatch ? fallbackMatch[1] : "";
  const city = (objektMatch ? objektMatch[4] : fallbackMatch ? fallbackMatch[2] : "").trim();
  if (!zipCode || !city) {
    dataGaps.push("location_unconfirmed");
  }

  // ZVG-Beschreibungen sind juristische Wertermittlungsprosa und nennen oft
  // Teilbereiche des Objekts ("1 Wohnung im EG und 2 Wohnungen im OG").
  // Die Portalsuche filtert bereits auf Mehrfamilienhaus (obj_arr[]=4), also
  // ist eine Textzahl unterhalb der Mindestgrenze kein belastbarer
  // Ausschlussgrund -- sie wird zu "unbestaetigt" herabgestuft, die Zahl
  // selbst bleibt fuer Kennzahlen und Anzeige erhalten.
  const roheEinheiten = parseUnits(beschreibungText);
  const units = roheEinheiten.units;
  const unitsConfident =
    roheEinheiten.unitsConfident && units !== null && units >= MIN_EINHEITEN_FUER_BESTAETIGUNG;

  const wohnflaecheText = ersteTrefferGruppe(beschreibungText, WOHNFLAECHE_PATTERNS);
  const baujahrText = ersteTrefferGruppe(beschreibungText, BAUJAHR_PATTERNS);

  const priceCents = Math.round(parseVerkehrswert(verkehrswertText) * 100);
  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    throw new Error(`Ungültiger Verkehrswert (nicht numerisch oder nicht positiv): "${verkehrswertText}"`);
  }

  const attachments: ZvgAttachment[] = $('a[aria-label="Anhang"]')
    .toArray()
    .map((el) => {
      const href = $(el).attr("href");
      if (!href) return null;
      const filename = normalizeWhitespace($(el).text()) || "anhang.pdf";
      return { url: new URL(href.trim(), kontext.url).toString(), filename };
    })
    .filter((a): a is ZvgAttachment => a !== null);

  const rawNoticeTextZeilen = felder.map((f) => `${f.label}: ${f.wert}`);
  for (const anhang of attachments) {
    rawNoticeTextZeilen.push(`Anhang (PDF): ${anhang.filename} — ${anhang.url}`);
  }

  return {
    externalId: kontext.externalId,
    url: kontext.url,
    title: objektLageText,
    caseNumber: kontext.caseNumber,
    court: kontext.court,
    priceCents,
    auctionAt: parseTerminZuUtcIso(terminText),
    zipCode,
    city,
    units,
    unitsConfident,
    livingAreaM2: wohnflaecheText === null ? null : parseGermanNumber(wohnflaecheText),
    yearBuilt: baujahrText === null ? null : parseInt(baujahrText, 10),
    rawNoticeText: rawNoticeTextZeilen.join("\n"),
    dataGaps,
    attachments,
  };
}
