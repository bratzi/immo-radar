/**
 * WG-Gesucht, Kategorie Wohnungen, Muenchen (Listenseite als HTML).
 *
 * Belegt am 2026-11-12: der Preis auf der Karte ist die GESAMTmiete
 * (Bogenhausen 10526015: Karte 850 EUR, Detailseite "Gesamtmiete 850").
 * Die Karte nennt keine PLZ, nur Ort und Stadtteil; die PLZ kommt aus einer
 * Tabelle der 25 Stadtbezirke (eine repraesentative PLZ je Bezirk, gut genug
 * fuer "liegt in Muenchen" und den Ring der Reihung, keine Adresse).
 *
 * Namen der Inserierenden stehen auf der Karte; sie werden nicht gelesen.
 */
import type { Angebot } from "../../lib/typen.js";
import { leeresAngebot } from "../../lib/typen.js";
import { erkenneBalkon } from "../../lib/balkon.js";
import { onlineSeitAusText } from "../../lib/onlineSeit.js";

export const WGG_BASIS = "https://www.wg-gesucht.de";
const TAUSCH = /tauschwohnung|wohnungs?tausch|zum tausch/i;
const BEFRISTET = /\bbefristet|zwischenmiete|\bauf zeit\b/i;

/** Stadtbezirk (oder bekannter Teil davon) -> repraesentative PLZ. */
const BEZIRKE: [RegExp, string][] = [
  [/altstadt|lehel/i, "80331"],
  [/ludwigsvorstadt|isarvorstadt|glockenbach/i, "80469"],
  [/maxvorstadt/i, "80799"],
  [/schwabing-freimann|freimann/i, "80805"],
  [/schwabing/i, "80796"],
  [/haidhausen|\bau\b/i, "81667"],
  [/sendling-westpark|westpark/i, "81373"],
  [/forstenried|f(ü|ue)rstenried/i, "81476"],
  [/solln/i, "81479"],
  [/thalkirchen|obersendling/i, "81379"],
  [/sendling/i, "81369"],
  [/schwanthalerh(ö|oe)he|westend/i, "80339"],
  [/neuhausen|nymphenburg/i, "80636"],
  [/moosach/i, "80992"],
  [/milbertshofen|am hart/i, "80807"],
  [/bogenhausen/i, "81925"],
  [/berg am laim/i, "81673"],
  [/trudering|riem/i, "81825"],
  [/ramersdorf|perlach/i, "81737"],
  [/obergiesing|fasangarten/i, "81541"],
  [/untergiesing|harlaching|giesing/i, "81547"],
  [/hadern/i, "81375"],
  [/pasing|obermenzing/i, "81241"],
  [/aubing|lochhausen|langwied/i, "81245"],
  [/allach|untermenzing/i, "80999"],
  [/feldmoching|hasenbergl/i, "80933"],
  [/laim/i, "80687"],
];

export function plzFuerStadtteil(stadtteil: string | null): string | null {
  if (!stadtteil) return null;
  for (const [muster, plz] of BEZIRKE) if (muster.test(stadtteil)) return plz;
  return null;
}

function entschluessle(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&euro;/g, "€").replace(/&sup2;/g, "²").replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function zahl(text: string | undefined): number | null {
  if (!text) return null;
  const m = text.match(/\d[\d.]*(,\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Zerlegt die Seite an den Kartenanfaengen `wgg-list-card offer_list_item`. */
function karten(html: string): string[] {
  const starts = [...html.matchAll(/wgg-list-card offer_list_item/g)].map((m) => html.lastIndexOf("<", m.index));
  return starts.map((s, i) => html.slice(s, i + 1 < starts.length ? starts[i + 1] : undefined));
}

export function parseWgGesuchtListe(html: string, jetzt: Date = new Date()): Angebot[] {
  const ergebnis: Angebot[] = [];
  for (const roh of karten(html)) {
    const k = roh.replace(/<script[\s\S]*?<\/script>/g, "").replace(/\s+/g, " ");
    const id = k.match(/data-id="(\d+)"/)?.[1];
    const href = k.match(/href="(\/wohnungen-in-[^"]+\.html)"/)?.[1];
    if (!id || !href) continue;
    const titel = entschluessle(k.match(/card-offer-title-text"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "");
    if (!titel || TAUSCH.test(titel)) continue;

    const preis = entschluessle(k.match(/price-row[\s\S]*?card-main-text">([^<]+)</)?.[1] ?? "");
    const groesse = entschluessle(k.match(/card-offer-property-size[\s\S]*?card-subtitle">([^<]+)</)?.[1] ?? "");
    const details = entschluessle(k.match(/card-offer-details-text[^"]*" title="([^"]*)"/)?.[1] ?? "");
    const zimmer = details.match(/(\d+(?:,\d)?)-Zimmer-Wohnung/)?.[1];
    const stadtteil = entschluessle(k.match(/>map<\/span>[^<]*<\/span>([^<]*)<span/)?.[1] ?? "") || null;
    const online = k.match(/online-since-icon[^>]*>update<\/span>\s*<span class="card-subtitle">([^<]+)</)?.[1];
    const frei = k.match(/calendar_today<\/span>\s*<span>\s*([\d.]+)\s*</)?.[1] ?? null;
    const bilder = [...new Set([...k.matchAll(/data-src="(https:\/\/img\.wg-gesucht\.de\/[^"]+)"/g)].map((m) => m[1]))];
    const warm = zahl(preis);
    const b = erkenneBalkon({ ausstattung: [], titel, beschreibung: "" });

    ergebnis.push(leeresAngebot({
      quelle: "wg-gesucht",
      externalId: id,
      url: WGG_BASIS + href,
      titel,
      warmmieteCents: warm === null ? null : Math.round(warm * 100),
      zimmer: zahl(zimmer),
      flaecheM2: zahl(groesse),
      stadtteil,
      plz: plzFuerStadtteil(stadtteil),
      verfuegbarAb: frei,
      befristet: BEFRISTET.test(titel) ? true : null,
      balkon: b.balkon,
      balkonBeleg: b.beleg,
      bildUrls: bilder,
      veroeffentlichtAm: onlineSeitAusText(online, jetzt),
    }));
  }
  return ergebnis;
}
