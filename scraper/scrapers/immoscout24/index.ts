/**
 * Quelle ImmoScout24: Mobil-API statt Webseite (die Webseite sperrt
 * Automaten). Kein Browser; der uebergebene Abrufer bleibt ungenutzt.
 * Freigabe des Nutzers fuer diesen Weg: 2026-11-11, im Wissen, dass die
 * API inoffiziell ist und jederzeit wegbrechen kann.
 *
 * Filter in der URL (Vorauswahl, kein Beleg; der Code prueft erneut):
 * Muenchen im Fangnetz (lib/profil.ts FANGNETZ). Kein Balkonfilter: der
 * Balkon ist seit 2026-11-11 nur noch ein Pluspunkt.
 */
import type { Angebot } from "../../lib/typen.js";
import { FANGNETZ } from "../../lib/profil.js";
import type { DetailErgebnis, OnlineStatus, Quelle, SweepErgebnis } from "../quelle.js";
import { seitenabstandMs } from "../sperre.js";
import { parseImmoscoutExpose, parseImmoscoutListe } from "./parse.js";

const API = "https://api.mobile.immobilienscout24.de";
// Die App-Kennungen, die die API erwartet (Stand Fredy, 2026-11).
const UA_SUCHE = "ImmoScout_28.1_26.5.2_._";
const UA_EXPOSE = "ImmoScout_27.3_26.0_._";

export const IMMOSCOUT_SUCHE =
  "searchType=region&realestatetype=apartmentrent&pricetype=calculatedtotalrent" +
  // Stadt plus die Suedwest-Bucht (Neuried, Planegg, Graefelfing), siehe UMLAND_SUEDWEST.
  `&geocodes=${["muenchen", "muenchen-kreis/neuried", "muenchen-kreis/planegg", "muenchen-kreis/graefelfing"]
    .map((g) => encodeURIComponent(`/de/bayern/${g}`)).join("%2C")}&price=-${FANGNETZ.warmmieteMaxEuro}.0` +
  `&numberofrooms=${FANGNETZ.zimmerMin}.0-&livingspace=${FANGNETZ.flaecheMinM2}.0-`;

export interface JsonAntwort { status: number; json: unknown }
export type JsonHoler = (url: string) => Promise<JsonAntwort>;

const SPERRSTATUS = new Set([401, 403, 412, 429]);

/**
 * Eigener Seitendeckel: das Fangnetz umfasst ~720 Inserate (2026-11-12), bei
 * 50 je Seite braucht ein vollstaendiger Lauf 15 Seiten. Nur ein
 * vollstaendiger Lauf markiert Abgaenge. Die API antwortet ohne Browser.
 */
export const IMMOSCOUT_MAX_SEITEN = 16;

export const netzHoler: JsonHoler = async (url) => {
  const expose = url.includes("/expose/");
  const r = await fetch(url, expose
    ? { headers: { "User-Agent": UA_EXPOSE, Accept: "application/json" } }
    : {
        method: "POST",
        headers: { "User-Agent": UA_SUCHE, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ supportedResultListTypes: [], userData: {} }),
      });
  let json: unknown = null;
  try { json = await r.json(); } catch { json = null; }
  return { status: r.status, json };
};

const warte = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function baueImmoscoutQuelle(hole: JsonHoler = netzHoler, pause: (ms: number) => Promise<void> = warte): Quelle {
  async function sweep(_ab: unknown, budgetMs: number): Promise<SweepErgebnis> {
    const ende = Date.now() + budgetMs;
    const gesehen = new Map<string, Angebot>();
    const alle = () => [...gesehen.values()];
    for (let n = 1; n <= IMMOSCOUT_MAX_SEITEN; n++) {
      if (n > 1) {
        if (Date.now() >= ende) return { angebote: alle(), vollstaendig: false, status: "ok", hinweis: "Budget erschoepft" };
        await pause(seitenabstandMs());
      }
      const a = await hole(`${API}/search/list?${IMMOSCOUT_SUCHE}&pagenumber=${n}`);
      if (SPERRSTATUS.has(a.status)) return { angebote: alle(), vollstaendig: false, status: "gesperrt", hinweis: "http" };
      const j = a.json as { numberOfPages?: number; resultListItems?: unknown[] } | null;
      if (a.status !== 200 || !j || !Array.isArray(j.resultListItems)) {
        return { angebote: alle(), vollstaendig: false, status: n === 1 ? "fehler" : "ok", hinweis: `HTTP ${a.status} auf Seite ${n}` };
      }
      for (const x of parseImmoscoutListe(j as Parameters<typeof parseImmoscoutListe>[0])) if (!gesehen.has(x.externalId)) gesehen.set(x.externalId, x);
      if (n >= (j.numberOfPages ?? 1)) return { angebote: alle(), vollstaendig: true, status: "ok", hinweis: null };
    }
    return { angebote: alle(), vollstaendig: false, status: "ok", hinweis: "Seitendeckel erreicht" };
  }

  async function ladeDetail(_ab: unknown, basis: Angebot): Promise<DetailErgebnis> {
    await pause(seitenabstandMs());
    const a = await hole(`${API}/expose/${basis.externalId}`);
    if (SPERRSTATUS.has(a.status)) return { angebot: basis, sperre: "http" };
    if (a.status !== 200 || !a.json) return { angebot: basis, sperre: null };
    return { angebot: parseImmoscoutExpose(a.json as Parameters<typeof parseImmoscoutExpose>[0], basis), sperre: null };
  }

  async function pruefeOnline(_ab: unknown, basis: Angebot): Promise<OnlineStatus> {
    await pause(seitenabstandMs());
    const a = await hole(`${API}/expose/${basis.externalId}`);
    if (SPERRSTATUS.has(a.status)) return "gesperrt";
    if (a.status === 404 || a.status === 410) return "weg";
    return a.status === 200 && a.json ? "online" : "unklar";
  }

  return { name: "immoscout24", aktiv: true, sweep, ladeDetail, pruefeOnline };
}

export const immoscoutQuelle = baueImmoscoutQuelle();
