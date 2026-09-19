/**
 * Die Texte der Karte an EINER Stelle -- fuer das Tooltip UND fuer `aria-label`.
 * Stuenden sie an zwei Stellen, sagte die Maus etwas anderes als der Screenreader.
 *
 * Reine Funktionen, ohne React. Fehlende Angaben werden zum Gedankenstrich
 * (`formatiereDscr`) bzw. zu einem ehrlichen Satz, nie zu einer Null.
 */
import type { SnapshotBundesland } from "../daten/snapshot.ts";
import { formatiereAnzahl, formatiereDscr } from "./formate.ts";
import type { PlzPunkt } from "./karte.ts";

export interface TooltipText {
  titel: string;
  zeilen: string[];
  /** Was ein Klick bewirkt -- damit die Bedienung auffindbar ist. */
  hinweis: string;
}

export function kachelText(
  land: SnapshotBundesland | undefined,
  name: string,
  gewaehlt: boolean
): TooltipText {
  const hinweis = gewaehlt
    ? "Klick entfernt den Filter auf dieses Land"
    : "Klick zeigt nur Objekte aus diesem Land";
  if (land === undefined) return { titel: name, zeilen: ["keine Daten im Snapshot"], hinweis };
  return {
    titel: name,
    zeilen: [
      `${formatiereAnzahl(land.objekte)} Objekte`,
      `${formatiereAnzahl(land.topTreffer)} Top-Treffer`,
      `Median-DSCR ${formatiereDscr(land.medianDscr)}`,
      land.standAlterTage === null
        ? "kein Regionslauf verzeichnet"
        : `zuletzt gesweept vor ${land.standAlterTage.toFixed(1)} Tagen`,
    ],
    hinweis,
  };
}

export function punktText(
  punkt: Pick<PlzPunkt, "zweisteller" | "anzahl" | "topTreffer">,
  gewaehlt: boolean
): TooltipText {
  return {
    titel: `PLZ-Bereich ${punkt.zweisteller}…`,
    zeilen: [
      `${formatiereAnzahl(punkt.anzahl)} Objekte`,
      `${formatiereAnzahl(punkt.topTreffer)} davon Top-Treffer`,
    ],
    hinweis: gewaehlt
      ? "Klick entfernt den Filter auf diesen Bereich"
      : "Klick zeigt nur Objekte aus diesem Bereich",
  };
}

/** Der Text fuer `aria-label`: alles in einer Zeile, ohne den Klickhinweis (`aria-pressed` sagt ihn schon). */
export function alsZeile(text: TooltipText): string {
  return [text.titel, ...text.zeilen].join(" · ");
}
