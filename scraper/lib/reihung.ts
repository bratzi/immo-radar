import type { Angebot } from "./typen.js";
import { ringFuerPlz } from "./muenchenPlz.js";

const ZWEI_STUNDEN_MS = 2 * 60 * 60 * 1000;

/** Punkte bestimmen nur die Reihenfolge der Meldungen, nie den Ausschluss (Spec 4.5). */
export function berechnePunkte(a: Angebot, jetzt: Date): number {
  let p = 0;
  if (a.zimmer !== null && a.zimmer >= 3) p += 30;
  if (a.warmmieteCents !== null && a.flaecheM2 !== null && a.flaecheM2 > 0) {
    const jeM2 = a.warmmieteCents / 100 / a.flaecheM2;
    if (jeM2 < 22) p += 20;
    else if (jeM2 < 25) p += 10;
  }
  if (a.plz !== null) {
    const ring = ringFuerPlz(a.plz);
    if (ring === 1) p += 15;
    else if (ring === 2) p += 5;
  }
  if (a.veroeffentlichtAm !== null) {
    const alter = jetzt.getTime() - new Date(a.veroeffentlichtAm).getTime();
    if (alter >= 0 && alter < ZWEI_STUNDEN_MS) p += 10;
  }
  if (a.warmmieteQuelle === "angegeben") p += 5;
  return p;
}

export function sortiereTreffer<T extends { punkte: number; externalId: string }>(t: T[]): T[] {
  return [...t].sort((x, y) => y.punkte - x.punkte || x.externalId.localeCompare(y.externalId));
}
