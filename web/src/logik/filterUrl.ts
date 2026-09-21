/**
 * Uebersetzt zwischen `Filter` und dem Suchteil der Adresse (B7-1).
 *
 * REIN, OHNE DOM -- damit ohne Browser pruefbar. Wer `history` anfassen
 * will, tut das im Hook `useFilterUrl`, nicht hier.
 *
 * KURZ DURCH WEGLASSEN: Geschrieben wird nur, was vom `LEERER_FILTER`
 * abweicht. Ohne Auswahl bleibt die Adresse ganz sauber.
 *
 * WIRFT NIE. Die Adresse ist von Hand veraenderbar, und eine abgestuerzte
 * Oberflaeche ist die schlechteste Antwort auf einen Tippfehler.
 */
import { LEERER_FILTER, type Filter } from "./filter.ts";
import type { Kartengroesse } from "./karte.ts";

export type Feldart = "liste" | "zahl" | "schalter" | "text";

/**
 * Feld -> kurzer Schluessel und Art.
 *
 * `Record<keyof Filter, ...>` ist die erste Wache: Ein neues Filterfeld
 * uebersetzt NICHT, bevor es hier einen Schluessel hat -- der Typpruefer
 * meldet die fehlende Zeile, kein Test muss es merken.
 *
 * Die Art muss ausdrueckich dastehen, weil `LEERER_FILTER` sie nicht
 * hergibt: `kaufpreisVon` und `terminVon` sind dort beide `null`.
 *
 * Exportiert fuer den Test, der daraus einen vollstaendig gesetzten Filter
 * ableitet.
 */
export const FELDER: Record<keyof Filter, { schluessel: string; art: Feldart }> = {
  bundeslaender: { schluessel: "bl", art: "liste" },
  plzZweisteller: { schluessel: "plz", art: "liste" },
  quellen: { schluessel: "q", art: "liste" },
  stufen: { schluessel: "st", art: "liste" },
  zustaende: { schluessel: "zu", art: "liste" },
  datenluecken: { schluessel: "dl", art: "liste" },
  kaufpreisVon: { schluessel: "kpv", art: "zahl" },
  kaufpreisBis: { schluessel: "kpb", art: "zahl" },
  wohnflaecheVon: { schluessel: "wfv", art: "zahl" },
  wohnflaecheBis: { schluessel: "wfb", art: "zahl" },
  grundstueckVon: { schluessel: "gsv", art: "zahl" },
  grundstueckBis: { schluessel: "gsb", art: "zahl" },
  baujahrVon: { schluessel: "bjv", art: "zahl" },
  baujahrBis: { schluessel: "bjb", art: "zahl" },
  einheitenVon: { schluessel: "ehv", art: "zahl" },
  einheitenBis: { schluessel: "ehb", art: "zahl" },
  nurUeberMeldeschwelle: { schluessel: "meld", art: "schalter" },
  nurPreissenkungen: { schluessel: "senk", art: "schalter" },
  nurSchwellenwechsler: { schluessel: "wech", art: "schalter" },
  terminNur: { schluessel: "tn", art: "schalter" },
  terminVon: { schluessel: "tv", art: "text" },
  terminBis: { schluessel: "tb", art: "text" },
};

const KARTE_SCHLUESSEL = "karte";
const KARTE_STANDARD: Kartengroesse = "objekte";
const KARTENGROESSEN: readonly Kartengroesse[] = ["objekte", "topTreffer", "medianDscr"];

export function zuSuchstring(filter: Filter, kartengroesse: Kartengroesse): string {
  const teile = new URLSearchParams();
  for (const [feld, { schluessel, art }] of Object.entries(FELDER)) {
    const wert = (filter as unknown as Record<string, unknown>)[feld];
    if (art === "liste") {
      const liste = wert as string[];
      if (liste.length > 0) teile.set(schluessel, liste.join(","));
    } else if (art === "schalter") {
      if (wert === true) teile.set(schluessel, "1");
    } else if (wert !== null && wert !== undefined) {
      teile.set(schluessel, String(wert));
    }
  }
  if (kartengroesse !== KARTE_STANDARD) teile.set(KARTE_SCHLUESSEL, kartengroesse);
  // URLSearchParams schreibt "%2C" fuer das Komma. Ein Komma ist im
  // Suchteil erlaubt, und die Adresse soll lesbar bleiben. Beim Lesen ist
  // beides gleichwertig, URLSearchParams nimmt das Komma unveraendert.
  return teile.toString().replaceAll("%2C", ",");
}

export function ausSuchstring(such: string): {
  filter: Filter;
  kartengroesse: Kartengroesse;
} {
  const teile = new URLSearchParams(such);
  const filter = { ...LEERER_FILTER };
  const ziel = filter as Record<string, unknown>;

  for (const [feld, { schluessel, art }] of Object.entries(FELDER)) {
    const roh = teile.get(schluessel);
    if (roh === null) continue;
    if (art === "liste") {
      ziel[feld] = roh
        .split(",")
        .map((eintrag) => eintrag.trim())
        .filter((eintrag) => eintrag !== "");
    } else if (art === "schalter") {
      ziel[feld] = roh === "1";
    } else if (art === "zahl") {
      const zahl = Number(roh);
      // Ein unlesbarer Wert faellt auf den Standard, statt NaN zu setzen --
      // NaN vergliche sich spaeter stumm mit allem als falsch.
      ziel[feld] = roh.trim() !== "" && Number.isFinite(zahl) ? zahl : null;
    } else {
      ziel[feld] = roh;
    }
  }

  const karte = teile.get(KARTE_SCHLUESSEL);
  const kartengroesse = KARTENGROESSEN.includes(karte as Kartengroesse)
    ? (karte as Kartengroesse)
    : KARTE_STANDARD;

  return { filter, kartengroesse };
}
