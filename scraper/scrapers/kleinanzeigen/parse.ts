/**
 * Parser fuer Kleinanzeigen-Mietwohnungen (Liste und Detail).
 *
 * Detailseite: zuerst das eingebettete Astro-JSON (`astro-island props`,
 * HTML-escaped, jedes Feld als `[0, wert]` bzw. Liste als `[1, [...]]`),
 * Selektoren der aelteren Seitenform nur als Rueckfall. Beide Formen kommen
 * live vor (Fixtures detail-1 bzw. detail-0).
 *
 * Zeitstempel: `sortingDate` ist bei gewerblichen Inseraten die Zeit des
 * stuendlichen Hochschiebens, nicht der Einstellung. Er wird deshalb nur bei
 * Privatinseraten als `veroeffentlichtAm` uebernommen -- und entscheidet ohnehin
 * nie ueber "neu" (das ist allein `(quelle, external_id)` unbekannt).
 */
import * as cheerio from "cheerio";
import type { Angebot } from "../../lib/typen.js";
import { leeresAngebot } from "../../lib/typen.js";
import { erkenneBalkon } from "../../lib/balkon.js";
import { NACHMIETER } from "../../lib/angebote.js";
import { kautionCents } from "../../lib/kaution.js";

export const KLEINANZEIGEN_BASIS = "https://www.kleinanzeigen.de";

/** "2,5" -> 2.5, "1.240" -> 1240, "84.00" -> 84; sonst null. */
export function deutscheZahl(text: string): number | null {
  const roh = text.match(/\d[\d.,]*/)?.[0];
  if (!roh) return null;
  let s = roh;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/\.\d{3}(?!\d)/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function euroCents(t: string | null | undefined): number | null {
  if (!t) return null;
  const n = deutscheZahl(t);
  return n === null || n <= 0 ? null : Math.round(n * 100);
}

const TAUSCH = /tauschwohnung|wohnungs?tausch|wohnungsswap|tauschangebot/i;

/** Gesuch: Titel beginnt mit "Suche"/"Wir suchen"/"Gesucht", ausser Nachmieter-Angebote. */
function istGesuchTitel(titel: string): boolean {
  return /^\W*(ich\s+suche|wir\s+suchen|suche|gesucht)\b/i.test(titel) && !/nachmieter|nachfolger/i.test(titel);
}

/** "81827 München - Trudering-Riem" oder "81827 Trudering-Riem" -> PLZ und Stadtteil. */
function ort(text: string): { plz: string | null; stadtteil: string | null } {
  const m = text.trim().match(/^(\d{5})\s+(.*)$/);
  if (!m) return { plz: null, stadtteil: null };
  const rest = m[2].replace(/^München\s*-\s*/i, "").trim();
  return { plz: m[1], stadtteil: rest && !/^München$/i.test(rest) ? rest : null };
}

// ---------------------------------------------------------------- Liste

/**
 * Liest alle Karten `article[data-adid][data-href]` (die Klasse `aditem`
 * fehlt in der aktuellen Seitenform). Die Liste traegt kein Datum und keine
 * Warmmiete; der Preis ist die Kaltmiete. Tauschangebote und Gesuche fallen
 * heraus.
 */
export function parseKleinanzeigenListe(html: string): Angebot[] {
  const $ = cheerio.load(html);
  const ergebnis: Angebot[] = [];
  $("article[data-adid][data-href]").each((_, el) => {
    const karte = $(el);
    const externalId = karte.attr("data-adid")!;
    const url = new URL(karte.attr("data-href")!, KLEINANZEIGEN_BASIS).href;
    let ldTitel: string | null = null;
    karte.find('script[type="application/ld+json"]').each((_, s) => {
      try { ldTitel ??= JSON.parse($(s).text()).title ?? null; } catch { /* Rueckfall Text */ }
    });
    karte.find("script,svg,style").remove();
    const teile = karte.find("*").contents()
      .filter((_, n) => n.type === "text").map((_, n) => $(n).text().trim()).get().filter(Boolean);
    const ortTeil = teile.find((t) => /^\d{5}\s/.test(t)) ?? "";
    const titel: string = ldTitel ?? teile[teile.indexOf(ortTeil) + 1] ?? "";
    const kartentext = teile.join("\n");
    if (TAUSCH.test(kartentext) || istGesuchTitel(titel)) return;

    const preisTeil = teile.find((t) => /^[\d.]+(,\d+)?\s*€/.test(t));
    const masse = teile.find((t) => /m²/.test(t) && /Zi\./.test(t)) ?? teile.find((t) => /^[\d.,]+\s*m²/.test(t)) ?? "";
    const flaeche = masse.match(/([\d.,]+)\s*m²/)?.[1];
    const zimmer = masse.match(/([\d.,]+)\s*Zi\./)?.[1];
    const b = erkenneBalkon({ ausstattung: [], titel, beschreibung: kartentext });

    ergebnis.push(leeresAngebot({
      quelle: "kleinanzeigen", externalId, url, titel,
      kaltmieteCents: euroCents(preisTeil),
      flaecheM2: flaeche ? deutscheZahl(flaeche) : null,
      zimmer: zimmer ? deutscheZahl(zimmer) : null,
      ...ort(ortTeil),
      // Kartentext ist zu kurz fuer eine Verneinung: hoechstens "ja".
      balkon: b.balkon === "ja" ? "ja" : "unbekannt",
      balkonBeleg: b.balkon === "ja" ? b.beleg : null,
      nachmieter: NACHMIETER.test(kartentext),
    }));
  });
  return ergebnis;
}

// ---------------------------------------------------------------- Detail

/** Gemeinsame Form beider Seitenvarianten. */
interface Rohdetail {
  titel: string;
  beschreibung: string;
  preis: string | null;
  attribute: Map<string, string>;
  merkmale: string[];
  ortText: string;
  bildUrls: string[];
  gewerblich: boolean | null;
  gesuch: boolean;
  datum: string | null;
}

/** Astro-Serialisierung `[0, x]` / `[1, [...]]` rekursiv aufloesen. */
function astro(v: unknown): unknown {
  if (Array.isArray(v)) {
    if (v[0] === 1 && Array.isArray(v[1])) return v[1].map(astro);
    if (v[0] === 0) return astro(v[1]);
    return v.map(astro);
  }
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, astro(x)]));
  return v;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;

function findeAnzeige(o: unknown, id: string, tiefe = 0): Obj | null {
  if (!o || typeof o !== "object" || tiefe > 12) return null;
  const x = o as Obj;
  if (x.id === id && "title" in x && "price" in x && "adType" in x) return x;
  for (const w of Object.values(x)) {
    const r = findeAnzeige(w, id, tiefe + 1);
    if (r) return r;
  }
  return null;
}

function ausJson($: cheerio.CheerioAPI, id: string): Rohdetail | null {
  let ad: Obj | null = null;
  $("astro-island[props]").each((_, el) => {
    if (ad) return;
    const p = $(el).attr("props")!;
    if (!p.includes(`"${id}"`) || !p.includes('"ogTitle"')) return;
    try { ad = findeAnzeige(astro(JSON.parse(p)), id); } catch { /* naechste Insel */ }
  });
  if (!ad) return null;
  const a: Obj = ad;
  const attribute = new Map<string, string>();
  for (const x of (a.localizedAttributes ?? []) as Obj[]) attribute.set(String(x.localizedName), String(x.localizedValue));
  const bilder = ((a.imageDetails?.imageList ?? []) as Obj[]).map((b) => b.xLargeUrl ?? b.largeUrl).filter(Boolean) as string[];
  return {
    titel: String(a.title ?? ""),
    beschreibung: String(a.description ?? ""),
    preis: a.price?.amount != null ? String(a.price.amount) : null,
    attribute,
    merkmale: ((a.tags ?? []) as unknown[]).map(String),
    ortText: String(a.locationSearchParameters?.location ?? ""),
    bildUrls: bilder,
    gewerblich: typeof a.userDetails?.commercial === "boolean" ? a.userDetails.commercial : null,
    gesuch: a.adType === "WANTED",
    datum: typeof a.sortingDate === "number" ? new Date(a.sortingDate).toISOString() : null,
  };
}

function ausSelektoren($: cheerio.CheerioAPI, html: string): Rohdetail | null {
  const titelEl = $("#viewad-title").clone();
  titelEl.find(".pvap-reserved-title").remove();
  const titel = titelEl.text().trim();
  if (!titel) return null;
  const attribute = new Map<string, string>();
  $(".addetailslist--detail").each((_, li) => {
    const wert = $(li).find(".addetailslist--detail--value").text().trim();
    const name = $(li).clone().children().remove().end().text().trim();
    if (name) attribute.set(name, wert);
  });
  const desc = $("#viewad-description-text").clone();
  desc.find("br").replaceWith("\n");
  const bilder = [...new Set($("[data-imgsrc]").map((_, i) => $(i).attr("data-imgsrc")!).get())];
  const verkaeufer = html.match(/"ad_seller_type":"(\w+)"/)?.[1];
  const datum = $("#viewad-extra-info span").first().text().trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return {
    titel,
    beschreibung: desc.text().trim(),
    preis: $("#viewad-price").text().trim() || null,
    attribute,
    merkmale: $(".checktag").map((_, t) => $(t).text().trim()).get(),
    ortText: $("#viewad-locality").first().text().trim(),
    bildUrls: bilder,
    gewerblich: verkaeufer ? verkaeufer !== "Private" : null,
    gesuch: /"Angebotstyp":"Gesuch"/.test(html),
    datum: datum ? `${datum[3]}-${datum[2]}-${datum[1]}` : null,
  };
}

/**
 * Liest eine Detailseite. `null` heisst: ausschliessen (Gesuch oder
 * Tauschangebot) oder unlesbar.
 */
export function parseKleinanzeigenDetail(html: string, kontext: { externalId: string; url: string }): Angebot | null {
  const $ = cheerio.load(html);
  const r = ausJson($, kontext.externalId) ?? ausSelektoren($, html);
  if (!r) return null;
  const tausch = r.attribute.get("Tauschangebot");
  if (r.gesuch || (tausch !== undefined && !/kein tausch/i.test(tausch)) || TAUSCH.test(r.titel)) return null;

  const nk = euroCents(r.attribute.get("Nebenkosten"));
  const heiz = euroCents(r.attribute.get("Heizkosten"));
  const nebenkostenCents = nk === null && heiz === null ? null : (nk ?? 0) + (heiz ?? 0);
  const b = erkenneBalkon({ ausstattung: r.merkmale, titel: r.titel, beschreibung: r.beschreibung });
  const zahl = (k: string) => (r.attribute.has(k) ? deutscheZahl(r.attribute.get(k)!) : null);

  return leeresAngebot({
    quelle: "kleinanzeigen", externalId: kontext.externalId, url: kontext.url, titel: r.titel,
    kaltmieteCents: euroCents(r.preis),
    nebenkostenCents,
    warmmieteCents: euroCents(r.attribute.get("Warmmiete")),
    zimmer: zahl("Zimmer"),
    flaecheM2: zahl("Wohnfläche"),
    balkon: b.balkon, balkonBeleg: b.beleg,
    ...ort(r.ortText),
    verfuegbarAb: r.attribute.get("Verfügbar ab") ?? null,
    befristet: /(?<!un)befristet/i.test(r.beschreibung) ? true : null,
    bildUrls: r.bildUrls,
    veroeffentlichtAm: r.gewerblich === false ? r.datum : null,
    nachmieter: NACHMIETER.test(`${r.titel}\n${r.beschreibung}`),
    kautionCents: kautionCents([...r.attribute].find(([k]) => /^kaution/i.test(k))?.[1], euroCents(r.preis)),
    detailGeladen: true,
  });
}
