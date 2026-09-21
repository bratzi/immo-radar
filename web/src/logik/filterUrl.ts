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

/**
 * Findet den ROHEN (noch nicht dekodierten) Wert zu `schluessel` im Suchteil.
 *
 * NUR fuer Listenfelder. `URLSearchParams.get` dekodiert vollstaendig, bevor
 * ein Aufrufer am Komma trennen kann -- damit waere ein durch `encodeURIComponent`
 * geschuetztes Komma innerhalb eines Wertes vom Trennkomma zwischen zwei
 * Listenelementen nicht mehr zu unterscheiden. Deshalb hier eine eigene,
 * kleine Zerlegung: zuerst an `&` (Feldtrenner), dann am ERSTEN `=` je Feld.
 * Ein Kaufmanns-Und INNERHALB eines Wertes gefaehrdet das nicht, weil
 * `zuSuchstring` es beim Schreiben bereits zu `%26` kodiert hat.
 */
function ersterRoherWert(such: string, schluessel: string): string | undefined {
  // `URLSearchParams` toleriert ein fuehrendes "?" (z. B. bei `location.search`
  // direkt uebergeben); diese eigene Zerlegung muss dasselbe tun, sonst
  // verhielten sich Listenfelder anders als alle anderen Feldarten.
  const ohneFragezeichen = such.startsWith("?") ? such.slice(1) : such;
  for (const teil of ohneFragezeichen.split("&")) {
    if (teil === "") continue;
    const trennstelle = teil.indexOf("=");
    const k = trennstelle === -1 ? teil : teil.slice(0, trennstelle);
    if (k === schluessel) return trennstelle === -1 ? "" : teil.slice(trennstelle + 1);
  }
  return undefined;
}

/**
 * `decodeURIComponent`, das nie wirft. Eine von Hand verstuemmelte
 * Prozent-Kodierung (z. B. ein einzelnes "%") gibt sonst einen `URIError` --
 * `ausSuchstring` wirft nie, also bleibt der Wert dann unveraendert stehen.
 */
function sicherDecodiert(wert: string): string {
  try {
    return decodeURIComponent(wert);
  } catch {
    return wert;
  }
}

export function zuSuchstring(filter: Filter, kartengroesse: Kartengroesse): string {
  const teile: string[] = [];
  for (const [feld, { schluessel, art }] of Object.entries(FELDER)) {
    const wert = (filter as unknown as Record<string, unknown>)[feld];
    if (art === "liste") {
      const liste = wert as string[];
      // Jedes Element EINZELN kodiert, danach mit einem ECHTEN Komma
      // verbunden: Ein Komma INNERHALB eines Elements wird dabei zu "%2C"
      // und bleibt so vom Trennkomma unterscheidbar. Siehe `ersterRoherWert`
      // fuer die passende Gegenseite beim Lesen.
      if (liste.length > 0) {
        teile.push(`${schluessel}=${liste.map((eintrag) => encodeURIComponent(eintrag)).join(",")}`);
      }
    } else if (art === "schalter") {
      if (wert === true) teile.push(`${schluessel}=1`);
    } else if (wert !== null && wert !== undefined) {
      teile.push(`${schluessel}=${encodeURIComponent(String(wert))}`);
    }
  }
  if (kartengroesse !== KARTE_STANDARD) {
    teile.push(`${KARTE_SCHLUESSEL}=${encodeURIComponent(kartengroesse)}`);
  }
  return teile.join("&");
}

export function ausSuchstring(such: string): {
  filter: Filter;
  kartengroesse: Kartengroesse;
} {
  const teile = new URLSearchParams(such);
  const filter = { ...LEERER_FILTER };
  const ziel = filter as Record<string, unknown>;

  for (const [feld, { schluessel, art }] of Object.entries(FELDER)) {
    if (art === "liste") {
      // Bewusst NICHT ueber `teile.get` -- siehe Kommentar an `ersterRoherWert`.
      const roh = ersterRoherWert(such, schluessel);
      if (roh === undefined) continue;
      ziel[feld] = roh
        .split(",")
        .map((eintrag) => sicherDecodiert(eintrag).trim())
        .filter((eintrag) => eintrag !== "");
      continue;
    }
    const roh = teile.get(schluessel);
    if (roh === null) continue;
    if (art === "schalter") {
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
