/**
 * Die Lücke, die benannt werden muss (Entwurf 6.2/6.3).
 *
 * > "`nw`, `bw` und `mv` weisen ihre Trefferzahl nirgends aus.
 * > `istRegionVollstaendig` kann für sie nie `true` liefern, und seit der
 * > Fail-closed-Umstellung heisst das: aus diesen Regionen wird nie ein
 * > Objekt als abgaengig markiert."
 *
 * Entwurf 6.3 verlangt, dass der Grund EINMAL IM KLARTEXT am Regionsfilter
 * steht. Die Frage ist nur: woher weiss die Oberflaeche, welche Regionen das
 * sind?
 *
 * WAS NICHT GEHT, und beides ist ausprobiert worden:
 *
 * - **Eine feste Liste `["nw","bw","mv"]`.** Sie waere schon beim Schreiben
 *   veraltet gewesen: `sh` ist seit der Messung vom 2026-09-15 die vierte und
 *   steht in keiner Spezifikation. Der Snapshot-Schritt hat aus demselben
 *   Grund darauf verzichtet.
 * - **`regionsstand.vollstaendig` des juengsten Laufs.** Das markiert 15 von
 *   16 Regionen, weil fast jeder Lauf am Zeitbudget endet. Ein Merkmal, das
 *   94 % einer Liste traegt, markiert nichts (die Lehre aus 3.6).
 *
 * WAS GEHT: die Wirkung selbst messen. Eine Region, aus der nie ein Abgang
 * erkannt wird, hat KEINEN EINZIGEN abgaengigen Eintrag -- das ist die
 * Definition, nicht ihre Naeherung, und sie braucht keine Schwelle.
 *
 * DIE EINE FEINHEIT, ohne die es falsch wird: gezaehlt wird nur die
 * HAUPTQUELLE. Immowelt und ZVG werden von verschiedenen Sweeps bedient, und
 * nur der Immowelt-Sweep ist es, der seine Trefferzahl nicht ausweist. Ueber
 * alle Quellen gezaehlt fiele Nordrhein-Westfalen heraus -- 4.384
 * Immowelt-Objekte ohne einen einzigen Abgang, aber 2 ZVG-Abgaenge --, also
 * ausgerechnet die Region, die A15 als erste nennt.
 *
 * Gegenprobe am Bestand vom 2026-09-15: Das Verfahren liefert genau
 * **Baden-Wuerttemberg, Mecklenburg-Vorpommern, Nordrhein-Westfalen und
 * Schleswig-Holstein** -- die drei aus A15 plus die vierte aus der Messung
 * vom 2026-09-15, ohne eine davon zu kennen.
 *
 * WAS DAS VERFAHREN NICHT HERGIBT: Es misst die Wirkung, nicht die Ursache.
 * Ein Land, in dem zufaellig nur nichts verschwunden ist, saehe genauso aus.
 * Der Text am Filter behauptet deshalb keine Ursache, sondern sagt, was
 * beobachtet ist -- und was daraus NICHT folgt.
 */
import type { SnapshotObjekt, Verfuegbarkeitszustand } from "../daten/snapshot.ts";

/**
 * Die Quelle, die ueber den Regionssweep laeuft und deren Vollstaendigkeit
 * ueber die Abgangserkennung entscheidet.
 */
const HAUPTQUELLE = "immowelt";

/**
 * Bundeslaender, aus denen ueber die Hauptquelle KEIN EINZIGER Abgang
 * erkannt wurde, obwohl dort Objekte beobachtet werden.
 */
export function laenderOhneAbgangserkennung(objekte: readonly SnapshotObjekt[]): string[] {
  const jeLand = new Map<string, { beobachtet: number; abgaenge: number }>();

  for (const objekt of objekte) {
    if (objekt.bundesland === null) continue;
    if (objekt.quelle !== HAUPTQUELLE) continue;
    const eintrag = jeLand.get(objekt.bundesland) ?? { beobachtet: 0, abgaenge: 0 };
    eintrag.beobachtet += 1;
    if (objekt.abgaengigSeit !== null) eintrag.abgaenge += 1;
    jeLand.set(objekt.bundesland, eintrag);
  }

  return [...jeLand.entries()]
    .filter(([, eintrag]) => eintrag.beobachtet > 0 && eintrag.abgaenge === 0)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b, "de"));
}

export interface Zustandszaehlung extends Record<Verfuegbarkeitszustand, number> {
  gesamt: number;
}

export function zaehleZustaende(objekte: readonly SnapshotObjekt[]): Zustandszaehlung {
  const zaehlung: Zustandszaehlung = {
    verfuegbar: 0,
    unbestaetigt: 0,
    abgaengig: 0,
    gesamt: objekte.length,
  };
  for (const objekt of objekte) zaehlung[objekt.zustand] += 1;
  return zaehlung;
}
