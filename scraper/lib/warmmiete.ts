import type { Angebot, WarmmieteQuelle } from "./typen.js";

/** Schaetzfaktor, wenn nur die Kaltmiete bekannt ist (Spec 2, Entscheidung 1). */
export const NEBENKOSTEN_FAKTOR = 1.25;

export function bestimmeWarmmiete(
  a: Pick<Angebot, "kaltmieteCents" | "nebenkostenCents" | "warmmieteCents">
): { warmmieteCents: number | null; warmmieteQuelle: WarmmieteQuelle } {
  if (a.warmmieteCents !== null && a.warmmieteCents > 0)
    return { warmmieteCents: a.warmmieteCents, warmmieteQuelle: "angegeben" };
  if (a.kaltmieteCents === null || a.kaltmieteCents <= 0)
    return { warmmieteCents: null, warmmieteQuelle: "unbekannt" };
  if (a.nebenkostenCents !== null && a.nebenkostenCents > 0)
    return { warmmieteCents: a.kaltmieteCents + a.nebenkostenCents, warmmieteQuelle: "kalt_plus_nk" };
  return { warmmieteCents: Math.round(a.kaltmieteCents * NEBENKOSTEN_FAKTOR), warmmieteQuelle: "geschaetzt" };
}
