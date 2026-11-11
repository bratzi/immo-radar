import type { Balkonbefund } from "./typen.js";

const NEGATIV = /(kein|ohne)\s+balkon|balkon\s+(nicht\s+vorhanden|fehlt)/i;
const FRANZOESISCH = /franz(ö|oe)sische[rnms]?\s+balkon/i;
const POSITIV = /balkon|loggia|terrasse/i;

function saetze(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

function ohneFranzoesisch(text: string): string {
  return text.replace(new RegExp(FRANZOESISCH.source, "gi"), "");
}

/**
 * Balkon ja/nein/unbekannt mit Beleg. Reihenfolge: Ausstattungsliste, Titel,
 * Beschreibung. Negation schlaegt Positiv, "franzoesischer Balkon" zaehlt nicht.
 */
export function erkenneBalkon(eingabe: {
  ausstattung: string[];
  titel: string;
  beschreibung: string;
}): { balkon: Balkonbefund; beleg: string | null } {
  const kandidaten = [...eingabe.ausstattung, ...saetze(eingabe.titel), ...saetze(eingabe.beschreibung)];
  for (const k of kandidaten) if (NEGATIV.test(k)) return { balkon: "nein", beleg: k };
  for (const k of kandidaten) if (POSITIV.test(ohneFranzoesisch(k))) return { balkon: "ja", beleg: k };
  return { balkon: "unbekannt", beleg: null };
}
