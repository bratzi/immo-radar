/**
 * Das Laden der einen Datei (Entwurf 5.3 / N4). Kein Schluessel, keine
 * Datenbank, kein Backend -- ein `fetch` auf eine statische Datei.
 *
 * DAS PROBLEM: Die Datei ist 18,9 MB gross (gemessen am 2026-09-15). Ein
 * schlichtes `await (await fetch(...)).json()` tut zwei langsame Dinge
 * hintereinander, ohne dass die Seite etwas davon zeigt:
 *
 *   1. den Abruf -- ueber die Leitung dauert das am laengsten,
 *   2. `JSON.parse` -- das haelt den Hauptstrang an und ist nicht teilbar.
 *
 * DIE ANTWORT, in drei Teilen:
 *
 *   1. Der Abruf wird STROMWEISE gelesen (`body.getReader()`), damit die
 *      Oberflaeche einen echten Fortschritt zeigen kann statt eines
 *      Kreisels, der nichts weiss. `Content-Length` liefert das Ziel nur bei
 *      unkomprimierter Antwort; sonst (komprimiert, Kopf fehlt) wird der
 *      Fortschritt als "unbekannt" gemeldet und NICHT geschaetzt. Die
 *      Meldungen sind auf eine je 100 ms gedrosselt -- die erste und der
 *      Uebergang in die Aufbereitung kommen immer durch.
 *   2. Zwischen Abruf und `JSON.parse` wird dem Browser ausdruecklich ein
 *      Bild gegoennt (`requestAnimationFrame` + `setTimeout 0`). Ohne das
 *      sieht der Nutzer den Zustand "Aufbereiten" nie, weil der Parser
 *      startet, bevor gezeichnet wurde.
 *   3. `JSON.parse` selbst bleibt auf dem Hauptstrang. Ein Web Worker wuerde
 *      hier NICHTS gewinnen: Das Ergebnis muesste als strukturierte Kopie
 *      zurueck, und deren Aufbau auf dem Hauptstrang kostet dieselbe
 *      Groessenordnung wie der Parser. Gemessene Parserzeit steht im
 *      Ergebnis und wird in der Fusszeile angezeigt -- damit die Entscheidung
 *      nachprüfbar bleibt und nicht geglaubt werden muss.
 */
import type { Snapshot } from "./snapshot.ts";
import { hatGueltigeKonstanten } from "../logik/snapshotpruefung.ts";

/** Wo die Datei liegt. Relativ, damit die Seite unter jedem Pfad laeuft. */
export const SNAPSHOT_URL = "dashboard-snapshot.json";

/** Hoechstens eine Fortschrittsmeldung je Abstand -- die Leseschleife laeuft je Netzwerk-Paket. */
export const MELDE_ABSTAND_MS = 100;

/**
 * Die Zahl, gegen die der Fortschritt gemessen werden darf -- oder `null`.
 *
 * `Content-Length` nennt die Groesse AUF DER LEITUNG. Hat der Server die Antwort
 * komprimiert (`Content-Encoding` gzip, br, ...), liefert `body.getReader()`
 * aber die DEKOMPRIMIERTEN Bytes -- bei diesem Snapshot rund siebenmal so viele.
 * Beides ins Verhaeltnis zu setzen schrieb "23.5 von 3.2 MB". Lieber ehrlich
 * "unbekannt" als eine Zahl, die nicht stimmt.
 */
export function erwarteteBytes(kopf: Pick<Headers, "get">): number | null {
  const kodierung = kopf.get("content-encoding");
  if (kodierung !== null && kodierung.trim().toLowerCase() !== "identity") return null;
  const laenge = kopf.get("content-length");
  if (laenge === null) return null;
  const zahl = Number.parseInt(laenge, 10);
  return Number.isFinite(zahl) && zahl > 0 ? zahl : null;
}

/**
 * Zweite Wache gegen denselben Fehler: Ist schon MEHR gelesen als erwartet,
 * stimmte der Massstab nicht (etwa weil der Browser `Content-Encoding` nicht
 * preisgibt) -- dann wird ab hier "unbekannt" gemeldet statt ein Ziel, das
 * bereits ueberschritten ist.
 */
export function gueltigesZiel(erwartet: number | null, gelesen: number): number | null {
  return erwartet !== null && gelesen <= erwartet ? erwartet : null;
}

/** Erste Meldung immer, danach hoechstens eine je Abstand. */
export function sollMelden(
  letzteMeldungMs: number | null,
  jetztMs: number,
  abstandMs: number = MELDE_ABSTAND_MS
): boolean {
  return letzteMeldungMs === null || jetztMs - letzteMeldungMs >= abstandMs;
}

export interface Ladefortschritt {
  phase: "abruf" | "aufbereitung";
  /** Bereits gelesene Bytes. */
  gelesen: number;
  /** Erwartete Gesamtgroesse, oder `null`, wenn die Antwort sie nicht nennt. */
  gesamt: number | null;
}

export interface Ladeergebnis {
  snapshot: Snapshot;
  /** Was wirklich gemessen wurde, nicht was geschaetzt ist. */
  messung: {
    bytes: number;
    abrufMs: number;
    parseMs: number;
    gesamtMs: number;
  };
}

/** Laesst den Browser ein Bild zeichnen, bevor der naechste Block laeuft. */
function einBildLang(): Promise<void> {
  return new Promise((fertig) => {
    requestAnimationFrame(() => setTimeout(fertig, 0));
  });
}

export async function ladeSnapshot(
  melde: (fortschritt: Ladefortschritt) => void,
  url: string = SNAPSHOT_URL
): Promise<Ladeergebnis> {
  const start = performance.now();
  const antwort = await fetch(url);
  if (!antwort.ok) {
    throw new Error(`Die Snapshot-Datei ist nicht abrufbar (HTTP ${antwort.status}).`);
  }

  const erwartet = erwarteteBytes(antwort.headers);

  let text: string;
  let bytes = 0;

  if (antwort.body === null) {
    // Kein lesbarer Strom (aelterer Browser, Testumgebung): dann eben am
    // Stueck. Der Fortschritt bleibt dabei ehrlich unbekannt.
    melde({ phase: "abruf", gelesen: 0, gesamt: erwartet });
    text = await antwort.text();
    bytes = text.length;
  } else {
    const leser = antwort.body.getReader();
    const stuecke: Uint8Array[] = [];
    melde({ phase: "abruf", gelesen: 0, gesamt: erwartet });
    let letzteMeldung: number | null = performance.now();
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      if (value !== undefined) {
        stuecke.push(value);
        bytes += value.byteLength;
        const jetzt = performance.now();
        if (sollMelden(letzteMeldung, jetzt)) {
          melde({ phase: "abruf", gelesen: bytes, gesamt: gueltigesZiel(erwartet, bytes) });
          letzteMeldung = jetzt;
        }
      }
    }
    // Ein einziger zusammenhaengender Puffer, dann einmal dekodieren --
    // Teilstuecke einzeln zu dekodieren zerschnitte mehrbytige Zeichen.
    const zusammen = new Uint8Array(bytes);
    let versatz = 0;
    for (const stueck of stuecke) {
      zusammen.set(stueck, versatz);
      versatz += stueck.byteLength;
    }
    text = new TextDecoder("utf-8").decode(zusammen);
  }

  const nachAbruf = performance.now();
  melde({ phase: "aufbereitung", gelesen: bytes, gesamt: bytes });
  await einBildLang();

  const vorParse = performance.now();
  const snapshot = JSON.parse(text) as Snapshot;
  const nachParse = performance.now();

  if (!Array.isArray(snapshot.objekte)) {
    throw new Error("Die Datei enthaelt keine Objektliste -- ist es ein Snapshot?");
  }
  // Zweite Feldpruefung an der Dateigrenze (Review I-1): `konstanten` kam
  // erst mit A18-4 dazu. Ohne diese Wache liesse eine Datei im alten Format
  // entweder das Rendern mit einem TypeError abstuerzen oder -- schlimmer --
  // die Karenzpruefung lautlos fail-open werden (`snapshotpruefung.ts`).
  if (!hatGueltigeKonstanten(snapshot)) {
    throw new Error("Snapshot ohne Konstanten -- Export zu alt?");
  }

  return {
    snapshot,
    messung: {
      bytes,
      abrufMs: nachAbruf - start,
      parseMs: nachParse - vorParse,
      gesamtMs: nachParse - start,
    },
  };
}
