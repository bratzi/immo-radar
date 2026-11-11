/**
 * ImmoScout24 ueber die Mobil-API der App (nicht dokumentiert, Wissen aus
 * Fredy: github.com/orangecoding/fredy, lib/services/immoscout/mobileApi.js).
 * Kein Code uebernommen, nur Endpunkte und Feldnamen.
 *
 * Belegt am 2026-11-11 (Forstenried, 172539355): der Preis in der
 * Trefferliste ist die KALTmiete (Liste 1.080 EUR, Expose 1.080 kalt /
 * 1.260 warm), obwohl die Suche nach Gesamtmiete filtert. Die Liste wird
 * deshalb geschaetzt; die Warmmiete kommt erst aus dem Expose.
 */
import type { Angebot } from "../../lib/typen.js";
import { leeresAngebot } from "../../lib/typen.js";
import { bestimmeWarmmiete } from "../../lib/warmmiete.js";

export const EXPOSE_BASIS = "https://www.immobilienscout24.de/expose/";
const TAUSCH = /tauschwohnung|wohnungs?tausch|zum tausch/i;

/** "1.080 €", "3.240,00", "48,6 m²" -> Zahl; sonst null. */
function zahl(text: string | undefined | null): number | null {
  if (!text) return null;
  const m = text.match(/\d[\d.]*(,\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function euroCents(text: string | undefined | null): number | null {
  const n = zahl(text);
  return n === null ? null : Math.round(n * 100);
}

interface Attribut { label?: string; value?: string; text?: string | null; type?: string }
interface ListenItem {
  id: string; title: string;
  address?: { line?: string };
  titlePicture?: { full?: string };
  attributes?: Attribut[];
}

function plzUndStadtteil(zeile: string | undefined): { plz: string | null; stadtteil: string | null } {
  if (!zeile) return { plz: null, stadtteil: null };
  const plz = zeile.match(/\b(\d{5})\b/)?.[1] ?? null;
  const teile = zeile.replace(/\(unvollständige Adresse\)/, "").split(",").map((s) => s.trim()).filter(Boolean);
  const letzter = teile.length > 1 ? teile[teile.length - 1] : null;
  return { plz, stadtteil: letzter && !/\d{5}/.test(letzter) ? letzter : null };
}

export function parseImmoscoutListe(antwort: { resultListItems?: { type: string; item: ListenItem }[] }): Angebot[] {
  const ergebnis: Angebot[] = [];
  for (const { type, item } of antwort.resultListItems ?? []) {
    if (type !== "EXPOSE_RESULT" || !item?.id || TAUSCH.test(item.title ?? "")) continue;
    const werte = (item.attributes ?? []).map((a) => a.value ?? "");
    const preis = werte.find((v) => v.includes("€"));
    const flaeche = werte.find((v) => v.includes("m²"));
    const zimmer = werte.find((v) => /Zi\./.test(v));
    const kalt = euroCents(preis);
    const { plz, stadtteil } = plzUndStadtteil(item.address?.line);
    ergebnis.push(leeresAngebot({
      quelle: "immoscout24",
      externalId: String(item.id),
      url: EXPOSE_BASIS + item.id,
      titel: item.title,
      kaltmieteCents: kalt,
      ...bestimmeWarmmiete({ kaltmieteCents: kalt, nebenkostenCents: null, warmmieteCents: null }),
      zimmer: zahl(zimmer),
      flaecheM2: zahl(flaeche),
      plz,
      stadtteil,
      bildUrls: item.titlePicture?.full ? [item.titlePicture.full] : [],
    }));
  }
  return ergebnis;
}

interface Abschnitt { type: string; title?: string; attributes?: Attribut[]; text?: string; addressLine2?: string }

/** Expose ergaenzt das Listenangebot; `null` heisst ausschliessen (Tausch). */
export function parseImmoscoutExpose(antwort: { sections?: Abschnitt[] }, basis: Angebot): Angebot | null {
  const s = antwort.sections ?? [];
  const titel = s.find((x) => x.type === "TITLE")?.title ?? basis.titel;
  if (TAUSCH.test(titel)) return null;

  const attr = new Map<string, Attribut>();
  for (const a of s.flatMap((x) => (x.type === "ATTRIBUTE_LIST" || x.type === "TOP_ATTRIBUTES" ? x.attributes ?? [] : [])))
    if (a.label) attr.set(a.label.replace(/:$/, "").trim(), a);
  const text = (l: string) => attr.get(l)?.text ?? null;

  const kalt = euroCents(text("Kaltmiete (zzgl. Nebenkosten)")) ?? basis.kaltmieteCents;
  const nk = euroCents(text("Nebenkosten"));
  const warmText = text("Warmmiete");
  const warm = warmText && !/keine angabe/i.test(warmText) ? euroCents(warmText) : null;
  const balkonAttr = attr.get("Balkon/Terrasse");

  return {
    ...basis,
    titel,
    kaltmieteCents: kalt,
    nebenkostenCents: nk,
    ...bestimmeWarmmiete({ kaltmieteCents: kalt, nebenkostenCents: nk, warmmieteCents: warm }),
    zimmer: zahl(text("Zimmer")) ?? basis.zimmer,
    flaecheM2: zahl(text("Wohnfläche ca.")) ?? basis.flaecheM2,
    // Die API fuehrt nur vorhandene Merkmale als CHECK; fehlt der Eintrag, bleibt es unbekannt.
    balkon: balkonAttr ? "ja" : basis.balkon,
    balkonBeleg: balkonAttr ? "Balkon/Terrasse" : basis.balkonBeleg,
    verfuegbarAb: text("Bezugsfrei ab") ?? basis.verfuegbarAb,
    detailGeladen: true,
  };
}
