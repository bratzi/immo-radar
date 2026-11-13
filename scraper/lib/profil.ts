import type { Angebot, Profilurteil } from "./typen.js";
import { istMuenchen } from "./muenchenPlz.js";

/** DAS Suchprofil. Aenderungen hier sind Aenderungen am Zweck des Projekts. */
export const PROFIL = {
  warmmieteMaxCents: 130_000,
  zimmerMin: 2,
  flaecheMinM2: 45,
} as const;

/**
 * Fangnetz der Portalfilter in den Such-URLs (seit 2026-11-12): bewusst
 * weiter als das Profil. Gespeichert wird alles darin; der Radar filtert
 * selbst und kann das Profil bis an diese Grenzen lockern.
 */
export const FANGNETZ = {
  warmmieteMaxEuro: 1800,
  zimmerMin: 1,
  flaecheMinM2: 30,
} as const;

/** WG-Zimmer im Titel; "WG-geeignet" bleibt eine ganze Wohnung. */
const WG = /\bwg[- ]?zimmer\b|\d\s*-?\s*er[- ]?wg\b|wohngemeinschaft|\bwg\b(?![- ]?(geeignet|tauglich|f[äa]hig))/i;
const WG_GEEIGNET = /\bwg[- ]?(geeignet|tauglich|f[äa]hig)|als wg geeignet|f(ü|ue)r\s+(eine\s+)?wg\b/i;

/**
 * Einzelnes Zimmer ohne das Wort WG (WG-Gesucht 2026-11-12: "Ein privates
 * Zimmer fuer eine Frau"). Eine Zimmerzahl >= 2 vor "Zimmer" bleibt Wohnung.
 */
const EINZELZIMMER = /^\W*(ein|1)\s+(\p{L}+\s+)?zimmer\b(?!-)|(?<!\b([2-9]|zwei|drei|vier)[\s-]*)\bzimmer\s+(frei|zu vermieten|f(ü|ue)r)\b|^\W*(m(ö|oe)blierte?s?|private?s?|helle?s?|sch(ö|oe)ne?s?|gro(ß|ss)e?s?)\s+zimmer\b/iu;

/**
 * Zimmer als zusammengesetztes Wort ("Balkonzimmer", "Einzelzimmer";
 * Ohne-Makler 2026-11-12). Raumnamen einer Wohnung zaehlen nicht, und ein
 * Titel, der eine Wohnung oder eine Zimmerzahl ab 2 nennt, bleibt Wohnung.
 */
const ZIMMER_KOMPOSITUM = /\p{L}+zimmer\b/giu;
const RAUMNAME = /^(wohn|schlaf|kinder|ess|bade?|arbeits|gaeste|gäste|ankleide)zimmer$/i;
const WOHNUNG_IM_TITEL = /wohnung|apartment|appartement|\b([2-9]|zwei|drei|vier)[\s,.-]*(½|,5)?\s*-?\s*zimmer/i;

function istZimmerKompositum(titel: string): boolean {
  if (WOHNUNG_IM_TITEL.test(titel)) return false;
  return (titel.match(ZIMMER_KOMPOSITUM) ?? []).some((w) => !RAUMNAME.test(w));
}

export function istWgAngebot(titel: string): boolean {
  if (WG_GEEIGNET.test(titel) && !/wg[- ]?zimmer|er[- ]?wg\b/i.test(titel)) return false;
  return WG.test(titel) || EINZELZIMMER.test(titel) || istZimmerKompositum(titel);
}

export function pruefeProfil(a: Angebot): Profilurteil {
  if (istWgAngebot(a.titel)) return { passt: "nein", gruende: ["wg_zimmer"] };
  const nein: string[] = [];
  const unklar: string[] = [];

  if (a.warmmieteCents === null) unklar.push("warmmiete_unbekannt");
  else if (a.warmmieteCents > PROFIL.warmmieteMaxCents) nein.push("warmmiete_zu_hoch");

  if (a.zimmer === null) unklar.push("zimmer_unbekannt");
  else if (a.zimmer < PROFIL.zimmerMin) nein.push("zu_wenig_zimmer");

  if (a.flaecheM2 === null) unklar.push("flaeche_unbekannt");
  else if (a.flaecheM2 < PROFIL.flaecheMinM2) nein.push("flaeche_zu_klein");

  // Balkon ist seit 2026-11-11 Wunsch, kein Muss: er zaehlt nur in der Reihung.

  if (a.plz === null) unklar.push("plz_unbekannt");
  else if (!istMuenchen(a.plz)) nein.push("ausserhalb_muenchen");

  if (a.befristet === true) nein.push("befristet");

  if (nein.length > 0) return { passt: "nein", gruende: [...nein, ...unklar] };
  if (unklar.length > 0) return { passt: "unklar", gruende: unklar };
  return { passt: "ja", gruende: [] };
}
