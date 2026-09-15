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
 *      Kreisels, der nichts weiss. `Content-Length` liefert das Ziel; fehlt
 *      es (etwa hinter einer komprimierenden Zwischenstelle), wird der
 *      Fortschritt als "unbekannt" gemeldet und NICHT geschaetzt.
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

/** Wo die Datei liegt. Relativ, damit die Seite unter jedem Pfad laeuft. */
export const SNAPSHOT_URL = "dashboard-snapshot.json";

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

  const laengeKopf = antwort.headers.get("content-length");
  const gesamt = laengeKopf === null ? null : Number.parseInt(laengeKopf, 10);
  const erwartet = gesamt !== null && Number.isFinite(gesamt) && gesamt > 0 ? gesamt : null;

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
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      if (value !== undefined) {
        stuecke.push(value);
        bytes += value.byteLength;
        melde({ phase: "abruf", gelesen: bytes, gesamt: erwartet });
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
  melde({ phase: "aufbereitung", gelesen: bytes, gesamt: erwartet ?? bytes });
  await einBildLang();

  const vorParse = performance.now();
  const snapshot = JSON.parse(text) as Snapshot;
  const nachParse = performance.now();

  if (!Array.isArray(snapshot.objekte)) {
    throw new Error("Die Datei enthaelt keine Objektliste -- ist es ein Snapshot?");
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
