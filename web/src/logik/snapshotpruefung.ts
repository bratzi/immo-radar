/**
 * Wacht darueber, dass eine geladene Snapshot-Datei den Ast `konstanten`
 * traegt, auf den `gliederung.ts` (Karenz) und `Bandstreifen.tsx`
 * (Meldeschwelle) sich verlassen (A18-4, Review I-1).
 *
 * Vor A18-4 kannte die Datei diesen Ast nicht -- Karenz und Meldeschwelle
 * waren Modulkonstanten in `web/` und damit immer gesetzt. Jetzt kommen sie
 * aus der JSON-Datei. Eine Datei im alten Format wuerde ohne diese Wache
 * entweder mitten im Rendern mit einem TypeError abstuerzen (Feld fehlt
 * ganz) oder -- schlimmer -- lautlos mit `NaN` weiterrechnen: `karenzTage`
 * fehlt oder ist keine Zahl, `karenzVorbei` liefert dann immer `false`, und
 * KEIN abgaengiges Objekt verlaesst mehr die Rangliste. Das waere fail-open.
 *
 * Reine Funktion, `unknown` als Eingabe: Was aus `JSON.parse` kommt, ist zur
 * Laufzeit nicht das, was der TypeScript-Typ `Snapshot` behauptet.
 */
export function hatGueltigeKonstanten(snapshot: unknown): boolean {
  if (typeof snapshot !== "object" || snapshot === null) return false;
  const konstanten = (snapshot as { konstanten?: unknown }).konstanten;
  if (typeof konstanten !== "object" || konstanten === null) return false;
  const { karenzTage, dscrMeldeschwelle } = konstanten as {
    karenzTage?: unknown;
    dscrMeldeschwelle?: unknown;
  };
  return Number.isFinite(karenzTage) && Number.isFinite(dscrMeldeschwelle);
}
