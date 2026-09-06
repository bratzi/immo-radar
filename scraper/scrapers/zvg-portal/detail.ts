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
}

interface ZvgDetailKontext {
  externalId: string;
  url: string;
  court: string;
  caseNumber: string;
}

const OBJEKT_LAGE_PATTERN = /^(.+?):\s*(.+),\s*(\d{5})\s+(.+)$/;
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
const WOHNFLAECHE_PATTERN = /(\d+(?:[.,]\d+)?)\s*qm\s*Wohnfl(?:ä|ae)che/i;
const BAUJAHR_PATTERN = /Bj\.?\s*(\d{4})/i;
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

  const objektMatch = objektLageText.match(OBJEKT_LAGE_PATTERN);
  const zipCode = objektMatch ? objektMatch[3] : "";
  const city = objektMatch ? objektMatch[4] : "";

  const { units, unitsConfident } = parseUnits(beschreibungText);
  const wohnflaecheMatch = beschreibungText.match(WOHNFLAECHE_PATTERN);
  const baujahrMatch = beschreibungText.match(BAUJAHR_PATTERN);

  const priceCents = Math.round(parseGermanNumber(verkehrswertText) * 100);
  if (!Number.isFinite(priceCents)) {
    throw new Error(`Ungültiger Verkehrswert (nicht numerisch): "${verkehrswertText}"`);
  }

  const anhangHref = $('a[aria-label="Anhang"]').attr("href");
  const rawNoticeTextZeilen = felder.map((f) => `${f.label}: ${f.wert}`);
  if (anhangHref) {
    rawNoticeTextZeilen.push(
      `Amtliche Bekanntmachung (PDF): ${new URL(anhangHref.trim(), kontext.url).toString()}`
    );
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
    livingAreaM2: wohnflaecheMatch ? parseGermanNumber(wohnflaecheMatch[1]) : null,
    yearBuilt: baujahrMatch ? parseInt(baujahrMatch[1], 10) : null,
    rawNoticeText: rawNoticeTextZeilen.join("\n"),
  };
}
