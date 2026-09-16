/**
 * Die Rangzahl als BAND, nicht als Punkt (Entwurf 3.4) -- das Herzstueck
 * dieser Oberflaeche.
 *
 * DIE GESTALTERISCHE ENTSCHEIDUNG: Alle Zeilen teilen sich EINE Skala mit
 * festem Wertebereich. Dadurch steht die Meldeschwelle 1,3 in jeder Zeile an
 * derselben waagerechten Stelle und bildet ueber die ganze Liste hinweg eine
 * durchgehende Senkrechte -- ein Lot. Man sieht auf einen Blick, welches Band
 * es haelt, welches darunter bleibt und welches die Linie ueberquert, also
 * ein Schwellenwechsler ist (3.6). Eine Skala je Zeile koennte das nicht:
 * Sie waere lesbar, aber nicht vergleichbar.
 *
 * DER WERTEBEREICH IST GEMESSEN, nicht gegriffen (Bestand vom 2026-09-15):
 * `rangzahl` hat ein Maximum von 2,40, `band.unten` liegt konstruktionsbedingt
 * nie darueber. **Die UNTERE Kante, nach der sortiert wird (3.5), wird also
 * nie abgeschnitten.** Nur die obere, optimistische Kante kann ueber 2,5
 * hinausreichen (`band.oben` P99 = 3,14, Maximum 4,00); solche Baender werden
 * am rechten Rand ausblendend gezeichnet, statt an einer harten Kante zu
 * enden, die eine Grenze behauptet, die es nicht gibt.
 *
 * WAS HIER NICHT STEHT: keine 0, kein leeres Zahlenfeld. Ein Objekt ohne
 * Kennzahl bekommt diesen Streifen ueberhaupt nicht -- an seiner Stelle
 * stehen die Klartext-Gruende (3.7, siehe `Objektzeile`).
 *
 * Die Meldeschwelle (`snapshot.konstanten.dscrMeldeschwelle`, A18-4) kommt
 * als PROPERTY herein, nicht als eigene Kopie: Sie steht hier NUR zum
 * ZEICHNEN -- ueber die Trefferklasse entscheidet sie nicht, das hat der
 * Export bereits getan (Entwurf 5.3, Punkt 4).
 */
import type { SnapshotObjekt } from "../daten/snapshot.ts";
import { formatiereDscr } from "../logik/formate.ts";

export const SKALA_MIN = 0;
export const SKALA_MAX = 2.5;

/** Beschriftete Teilstriche der Skala. */
export const SKALA_STRICHE = [0, 0.5, 1, 1.5, 2, 2.5];

export function anteilAufSkala(wert: number): number {
  const anteil = (wert - SKALA_MIN) / (SKALA_MAX - SKALA_MIN);
  return Math.min(1, Math.max(0, anteil));
}

export function prozentAufSkala(wert: number): string {
  return `${(anteilAufSkala(wert) * 100).toFixed(2)}%`;
}

/**
 * Die Kopfleiste -- einmal je Bereich, nicht je Zeile.
 *
 * `mitSkala` ist keine Kosmetik: Im Bereich "Nicht beurteilbar" traegt KEIN
 * Objekt eine Rangzahl. Eine DSCR-Achse samt Meldeschwelle ueber einer Spalte
 * zu zeichnen, in der ausschliesslich Klartext steht, waere ein Massstab an
 * etwas Unmessbarem -- dieselbe Behauptung wie eine graue 0,0.
 */
export function Skalenkopf({
  mitRang,
  mitSkala,
  dscrMeldeschwelle,
}: {
  mitRang: boolean;
  mitSkala: boolean;
  dscrMeldeschwelle: number;
}) {
  const schwelleProzent = prozentAufSkala(dscrMeldeschwelle);
  return (
    <div className={`skalenkopf${mitRang ? "" : " skalenkopf--ohne-rang"}`}>
      {mitRang && <span style={{ textAlign: "right" }}>Rang</span>}
      <span>Objekt</span>
      <span style={{ textAlign: "right" }}>Preis · Fläche</span>
      {mitSkala ? (
        <div className="band">
          <div className="skalenkopf__achse" aria-label="Skala der Rangzahl (DSCR)">
            {SKALA_STRICHE.map((wert) => (
              <span
                key={wert}
                className="skalenkopf__strich"
                style={{ left: prozentAufSkala(wert) }}
              >
                <span className="skalenkopf__marke">{formatiereDscr(wert)}</span>
              </span>
            ))}
            <span className="skalenkopf__schwelle" style={{ left: schwelleProzent }}>
              <span>▲ Meldeschwelle {formatiereDscr(dscrMeldeschwelle)}</span>
            </span>
          </div>
          <span className="band__wert">DSCR-Band</span>
        </div>
      ) : (
        <span>Warum keine Kennzahl</span>
      )}
      <span style={{ textAlign: "right" }}>Stufe · Zustand</span>
    </div>
  );
}

/**
 * Der Streifen einer Zeile.
 *
 * Drei Faelle, und jeder sieht anders aus:
 *
 * - **Band vorhanden** (S1/S2): die Spanne als Balken, der Punktwert als
 *   heller Strich darin. Der Balken ist die Aussage, der Strich die Mitte
 *   der Schaetzung -- nicht umgekehrt.
 * - **Kein Band, aber eine Zahl** (S3, belegte Miete): eine Raute statt
 *   eines Balkens. Dort gibt es keine Schaetzung, die gegen das Objekt
 *   laufen koennte, also auch keine Spanne -- und die andere Form sagt das,
 *   ohne dass man eine Legende braucht.
 * - **Keine Kennzahl** (S0): Diese Komponente wird gar nicht erst aufgerufen.
 */
export function Bandstreifen({
  objekt,
  dscrMeldeschwelle,
}: {
  objekt: SnapshotObjekt;
  dscrMeldeschwelle: number;
}) {
  if (objekt.rangzahl === null) return null;

  const band = objekt.band;
  const abgeschnitten = band !== null && band.oben > SKALA_MAX;
  const schwelleProzent = prozentAufSkala(dscrMeldeschwelle);

  const beschreibung =
    band === null
      ? `Rangzahl (DSCR) ${formatiereDscr(objekt.rangzahl)}, aus belegter Miete gerechnet`
      : `Rangzahl (DSCR) ${formatiereDscr(objekt.rangzahl)}, Band ${formatiereDscr(
          band.unten
        )} bis ${formatiereDscr(band.oben)}${
          objekt.istSchwellenwechsler ? " — überquert die Meldeschwelle" : ""
        }`;

  return (
    <div className="band" role="img" aria-label={beschreibung} title={beschreibung}>
      {/*
        Das Feld traegt alle Marken. Es ist vom Zahlenwert rechts durch die
        Flex-Aufteilung getrennt und NICHT nur durch einen Verlauf ueberdeckt:
        Ein Band, das bis an die Skalenkante reicht, darf nicht unter der
        Zahl verschwinden, die es beschreibt.
      */}
      <div className="band__feld">
        <span className="band__achse" />
        <span className="band__schwelle" style={{ left: schwelleProzent }} />

        {band !== null && (
          <span
            className={`band__spanne${abgeschnitten ? " band__spanne--offen" : ""}`}
            style={{
              left: prozentAufSkala(band.unten),
              width: `${(anteilAufSkala(band.oben) - anteilAufSkala(band.unten)) * 100}%`,
            }}
          />
        )}

        {/* Das Merkmal aus 3.6: Der Rang selbst steht zur Disposition. */}
        {objekt.istSchwellenwechsler && (
          <span className="band__wechsler" style={{ left: schwelleProzent }} />
        )}

        <span
          className={`band__punkt${band === null ? " band__punkt--belegt" : ""}`}
          style={{ left: prozentAufSkala(objekt.rangzahl) }}
        />
      </div>

      <span className="band__wert">
        {band === null
          ? formatiereDscr(objekt.rangzahl)
          : `${formatiereDscr(band.unten)}–${formatiereDscr(band.oben)}`}
      </span>
    </div>
  );
}
