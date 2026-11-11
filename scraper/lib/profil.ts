import type { Angebot, Profilurteil } from "./typen.js";
import { istMuenchen } from "./muenchenPlz.js";

/** DAS Suchprofil. Aenderungen hier sind Aenderungen am Zweck des Projekts. */
export const PROFIL = {
  warmmieteMaxCents: 130_000,
  zimmerMin: 2,
  flaecheMinM2: 45,
} as const;

/** WG-Zimmer im Titel; "WG-geeignet" bleibt eine ganze Wohnung. */
const WG = /\bwg[- ]?zimmer\b|\d\s*-?\s*er[- ]?wg\b|wohngemeinschaft|\bwg\b(?![- ]?(geeignet|tauglich|f[äa]hig))/i;
const WG_GEEIGNET = /\bwg[- ]?(geeignet|tauglich|f[äa]hig)|als wg geeignet/i;

export function istWgAngebot(titel: string): boolean {
  if (WG_GEEIGNET.test(titel) && !/wg[- ]?zimmer|er[- ]?wg\b/i.test(titel)) return false;
  return WG.test(titel);
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

  if (a.balkon === "nein") nein.push("kein_balkon");
  else if (a.balkon === "unbekannt") unklar.push("balkon_unbekannt");

  if (a.plz === null) unklar.push("plz_unbekannt");
  else if (!istMuenchen(a.plz)) nein.push("ausserhalb_muenchen");

  if (a.befristet === true) nein.push("befristet");

  if (nein.length > 0) return { passt: "nein", gruende: [...nein, ...unklar] };
  if (unklar.length > 0) return { passt: "unklar", gruende: unklar };
  return { passt: "ja", gruende: [] };
}
