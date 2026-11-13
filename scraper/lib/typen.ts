export type Quelle = "immowelt" | "kleinanzeigen" | "wg-gesucht" | "immoscout24" | "ohne-makler";
export type Balkonbefund = "ja" | "nein" | "unbekannt";
export type WarmmieteQuelle = "angegeben" | "kalt_plus_nk" | "geschaetzt" | "unbekannt";
export type Passt = "ja" | "nein" | "unklar";

export interface Angebot {
  quelle: Quelle;
  externalId: string;
  url: string;
  titel: string;
  kaltmieteCents: number | null;
  nebenkostenCents: number | null;
  warmmieteCents: number | null;
  warmmieteQuelle: WarmmieteQuelle;
  zimmer: number | null;
  flaecheM2: number | null;
  balkon: Balkonbefund;
  balkonBeleg: string | null;
  plz: string | null;
  stadtteil: string | null;
  verfuegbarAb: string | null;
  befristet: boolean | null;
  bildUrls: string[];
  veroeffentlichtAm: string | null;
  /** Tenant looks for a successor ("Nachmieter gesucht"); seen in the listing text. */
  nachmieter?: boolean;
  detailGeladen: boolean;
  /** Zeitpunkt eines frueher geladenen Exposes, das weiterverwendet wird. */
  detailGeladenAm?: string | null;
}

export interface Profilurteil {
  passt: Passt;
  gruende: string[];
}

/** Leeres Angebot fuer Tests und Parser: alles unbekannt. */
export function leeresAngebot(teil: Pick<Angebot, "quelle" | "externalId" | "url" | "titel"> & Partial<Angebot>): Angebot {
  return {
    kaltmieteCents: null,
    nebenkostenCents: null,
    warmmieteCents: null,
    warmmieteQuelle: "unbekannt",
    zimmer: null,
    flaecheM2: null,
    balkon: "unbekannt",
    balkonBeleg: null,
    plz: null,
    stadtteil: null,
    verfuegbarAb: null,
    befristet: null,
    bildUrls: [],
    veroeffentlichtAm: null,
    detailGeladen: false,
    ...teil,
  };
}
