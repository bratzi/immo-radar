/**
 * Die Karte aus N2 -- zwei Schichten in EINER Zeichenflaeche.
 *
 * Warum sie so aussieht, wie sie aussieht, steht ausfuehrlich in
 * `src/logik/karte.ts`. Kurz:
 *
 *   Grund      echter, vereinfachter Deutschlandumriss (aus dem Repo)
 *   Schicht 1  16 SCHEMATISCHE Kacheln an abgeleiteten Ankerpunkten,
 *              eingefaerbt nach einer umschaltbaren Groesse, anklickbar
 *   Schicht 2  echte Punkte fuer die Objekte, die eine PLZ tragen
 *
 * Die Kachel ist sichtbar eine Marke und keine Flaeche; niemand kann sie fuer
 * eine Grenze halten. Die Punkte liegen an ihrer echten Stelle. So traegt
 * jede Schicht genau die Genauigkeit, die ihre Daten decken -- und die
 * Legende sagt den Unterschied, dauerhaft und aus den Daten gerechnet.
 *
 * KEIN KACHEL-DIENST, KEINE FREMDANFRAGE (N5). Alles ist Inline-SVG.
 */
import { useEffect, useMemo, useState } from "react";
import type { SnapshotBundesland, SnapshotObjekt } from "../daten/snapshot.ts";
import { formatiereAnzahl, formatiereDscr, formatiereProzent } from "../logik/formate.ts";
import { alsZeile, filterKurz, kachelText, punktText, type TooltipText } from "../logik/kartentexte.ts";
import { oeffnetTooltip } from "../logik/tooltipAusloeser.ts";
import { KartenTooltip, type TooltipZiel } from "./KartenTooltip.tsx";
import { holeSpeicher, liesKarteOffen, schreibeKarteOffen } from "../logik/karteOffen.ts";
import {
  KARTENGROESSE_NAMEN,
  KARTE_BREITE,
  KARTE_HOEHE,
  berechneAbdeckung,
  beschreibeMarkierung,
  buendlePlzPunkte,
  markierungFuer,
  kachelLagen,
  spanneDerGroesse,
  umrissPfad,
  werteDerGroesse,
  type Kartengroesse,
} from "../logik/karte.ts";

/**
 * Die Farbskala der Flaechenfaerbung.
 *
 * Ein einziger Farbton (das Gold der Oberflaeche) in steigender Deckung, kein
 * Regenbogen: Die Groessen sind allesamt "mehr ist mehr", und ein
 * mehrfarbiger Verlauf legte Schwellen hinein, die keine sind. Ein Land OHNE
 * Wert bekommt keine blasse Farbe, sondern eine sichtbar andere Fuellung --
 * "kein Wert" ist nicht "kleiner Wert".
 */
function fuellung(anteil: number | null): string {
  if (anteil === null) return "var(--flaeche-still)";
  const deckung = 0.09 + anteil * 0.68;
  return `rgba(227, 165, 69, ${deckung.toFixed(3)})`;
}

function textfarbe(anteil: number | null): string {
  if (anteil === null) return "var(--papier-still)";
  return anteil > 0.52 ? "#1a1408" : "var(--papier)";
}

interface Eigenschaften {
  bundeslaender: readonly SnapshotBundesland[];
  /**
   * ALLE Objekte. Die Karte zeigt IMMER den ganzen Bestand, nie die Auswahl.
   *
   * Der erste Entwurf liess die Punktschicht dem Filter folgen und die
   * Flaechenfaerbung nicht -- die Flaechenwerte kommen aus
   * `snapshot.bundeslaender` und sind Bestandszahlen. Im Browser stand dann
   * eine Kachel "4.471 Objekte" ueber einer leeren Liste, unter EINER
   * Legende, die Bestandszahlen nannte. Zwei Staende nebeneinander, genau
   * der Fehler, den dieses Projekt zweimal teuer korrigiert hat.
   *
   * Aufgeloest zugunsten des Bestands: Die Karte ist der EINSTIEG in die
   * Liste, nicht ihr Ergebnis. Was gerade gewaehlt ist, zeigt der goldene
   * Rahmen an der Kachel -- und die Tafel sagt den Unterschied in einem Satz.
   */
  alleObjekte: readonly SnapshotObjekt[];
  groesse: Kartengroesse;
  setzeGroesse: (groesse: Kartengroesse) => void;
  gewaehlteLaender: readonly string[];
  schalteLand: (name: string) => void;
  /** Die Zeile unter dem Zeiger bzw. mit Tastaturfokus -- `null`, wenn keine. */
  hervorgehobenesObjekt: SnapshotObjekt | null;
}

export function Karte({
  bundeslaender,
  alleObjekte,
  groesse,
  setzeGroesse,
  gewaehlteLaender,
  schalteLand,
  hervorgehobenesObjekt,
}: Eigenschaften) {
  const lagen = useMemo(() => kachelLagen(), []);
  const pfad = useMemo(() => umrissPfad(), []);
  const punkte = useMemo(() => buendlePlzPunkte(alleObjekte), [alleObjekte]);
  const abdeckung = useMemo(() => berechneAbdeckung(alleObjekte), [alleObjekte]);
  const spanne = useMemo(() => spanneDerGroesse(bundeslaender, groesse), [bundeslaender, groesse]);

  const markierung = useMemo(
    () => (hervorgehobenesObjekt === null ? null : markierungFuer(hervorgehobenesObjekt)),
    [hervorgehobenesObjekt]
  );
  const punktJeZweisteller = useMemo(
    () => new Map(punkte.map((p) => [p.zweisteller, p])),
    [punkte]
  );
  const lageJeName = useMemo(() => new Map(lagen.map((l) => [l.name, l])), [lagen]);

  const jeName = useMemo(
    () => new Map(bundeslaender.map((land) => [land.name, land])),
    [bundeslaender]
  );

  const anteilVon = (land: SnapshotBundesland | undefined): number | null => {
    if (land === undefined || spanne === null) return null;
    const wert = werteDerGroesse(land, groesse);
    if (wert === null) return null;
    if (spanne.max === spanne.min) return 1;
    return (wert - spanne.min) / (spanne.max - spanne.min);
  };

  const [ziel, setZiel] = useState<TooltipZiel | null>(null);

  // Ein Bildlauf laesst die Form unter dem stehenden Tooltip wegwandern.
  const tooltipOffen = ziel !== null;
  useEffect(() => {
    if (!tooltipOffen) return;
    const schliessen = () => setZiel(null);
    window.addEventListener("scroll", schliessen, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", schliessen, { capture: true });
  }, [tooltipOffen]);

  const zeigeTooltip =
    (text: TooltipText) =>
    (ereignis: React.PointerEvent<SVGGElement> | React.FocusEvent<SVGGElement>) => {
      // Welches Ereignis ueberhaupt ein Hover ist, entscheidet `oeffnetTooltip`
      // -- rein und getestet (Fingertipp und Klickfokus zaehlen nicht).
      const darf =
        "pointerType" in ereignis
          ? oeffnetTooltip({ art: "zeiger", zeigerArt: ereignis.pointerType })
          : oeffnetTooltip({
              art: "fokus",
              fokusSichtbar: ereignis.currentTarget.matches(":focus-visible"),
            });
      if (!darf) return;
      const form = ereignis.currentTarget.querySelector("[data-anker]") ?? ereignis.currentTarget;
      const r = form.getBoundingClientRect();
      setZiel({ anker: { x: r.left, y: r.top, breite: r.width, hoehe: r.height }, text });
    };
  const verbergeTooltip = () => setZiel(null);

  // Der Radius waechst mit der Wurzel der Anzahl: Die FLAECHE des Punktes
  // soll die Anzahl tragen, nicht sein Durchmesser -- sonst sieht ein Punkt
  // mit 40 Objekten viermal so gewichtig aus, wie er ist.
  const maxAnzahl = punkte.reduce((groesster, p) => Math.max(groesster, p.anzahl), 1);
  const radius = (anzahl: number) => 2.2 + Math.sqrt(anzahl / maxAnzahl) * 5.4;

  const markierterPunkt =
    markierung?.art === "plz" ? punktJeZweisteller.get(markierung.zweisteller) : undefined;
  const markierteLage =
    markierung?.art === "bundesland" ? lageJeName.get(markierung.name) : undefined;

  // Der Ausgangswert wird EINMAL gelesen (Initialisierungsfunktion), nicht je Render.
  const [offen, setOffen] = useState(() => liesKarteOffen(holeSpeicher()));
  const schalteOffen = () => {
    const neu = !offen;
    setOffen(neu);
    schreibeKarteOffen(holeSpeicher(), neu);
  };
  // Zweites Argument: gewaehltePlz gibt es erst ab Task 8 -- dort nachziehen,
  // sonst zeigt der zugeklappte Kopf einen aktiven PLZ-Filter nie an.
  const kurz = filterKurz(gewaehlteLaender, []);

  return (
    <section className={`tafel${offen ? "" : " tafel--zu"}`}>
      <div className="tafel__kopf">
        <button
          type="button"
          className="karte__zuklappen"
          aria-expanded={offen}
          aria-controls="karte-inhalt"
          aria-label={offen ? "Karte zuklappen" : "Karte aufklappen"}
          onClick={schalteOffen}
        >
          <span aria-hidden="true">▶</span>
        </button>
        <h2 className="tafel__titel">
          Karte <span style={{ opacity: 0.6, letterSpacing: "0.05em" }}>· ganzer Bestand</span>
        </h2>
        {kurz !== "" && <span className="karte__filterkurz">{kurz}</span>}
        <div className="karte__schalter" role="group" aria-label="Größe der Flächenfärbung">
          {(Object.keys(KARTENGROESSE_NAMEN) as Kartengroesse[]).map((schluessel) => (
            <button
              key={schluessel}
              type="button"
              aria-pressed={groesse === schluessel}
              onClick={() => setzeGroesse(schluessel)}
            >
              {KARTENGROESSE_NAMEN[schluessel]}
            </button>
          ))}
        </div>
      </div>

      <div className="tafel__inhalt" id="karte-inhalt">
        <svg
          className="karte__bild"
          viewBox={`0 0 ${KARTE_BREITE} ${KARTE_HOEHE}`}
          role="group"
          aria-label="Deutschlandkarte: 16 Bundesland-Kacheln und die punktgenau verortbaren Objekte"
        >
          <path className="karte__umriss" d={pfad} />

          {/* Schicht 2 zuerst zeichnen waere falsch herum -- die Punkte
              gehoeren SICHTBAR ueber die Kacheln, sie sind die genaueren
              Daten. Also erst die Kacheln. */}
          {lagen.map((lage) => {
            const land = jeName.get(lage.name);
            const anteil = anteilVon(land);
            const gewaehlt = gewaehlteLaender.includes(lage.name);
            return (
              <g
                key={lage.name}
                className={`kachel${gewaehlt ? " kachel--gewaehlt" : ""}`}
                onClick={() => schalteLand(lage.name)}
                role="button"
                tabIndex={0}
                aria-pressed={gewaehlt}
                aria-label={alsZeile(kachelText(land, lage.name, gewaehlt))}
                onKeyDown={(ereignis) => {
                  if (ereignis.key === "Enter" || ereignis.key === " ") {
                    ereignis.preventDefault();
                    schalteLand(lage.name);
                  }
                }}
                onPointerEnter={zeigeTooltip(kachelText(land, lage.name, gewaehlt))}
                onPointerLeave={verbergeTooltip}
                onFocus={zeigeTooltip(kachelText(land, lage.name, gewaehlt))}
                onBlur={verbergeTooltip}
              >
                {lage.versetzt && (
                  <>
                    <line
                      className="kachel__faden"
                      x1={lage.ankerX}
                      y1={lage.ankerY}
                      x2={lage.x}
                      y2={lage.y}
                    />
                    <circle className="kachel__anker" cx={lage.ankerX} cy={lage.ankerY} r={1.6} />
                  </>
                )}
                <rect
                  className="kachel__flaeche"
                  data-anker=""
                  x={lage.x - lage.breite / 2}
                  y={lage.y - lage.hoehe / 2}
                  width={lage.breite}
                  height={lage.hoehe}
                  rx={3}
                  fill={fuellung(anteil)}
                />
                <text className="kachel__kuerzel" x={lage.x} y={lage.y} fill={textfarbe(anteil)}>
                  {lage.kuerzel}
                </text>
              </g>
            );
          })}

          {punkte.map((punkt) => {
            // `gewaehlt` ist hier noch fest `false`: Den Auswahlzustand der
            // PLZ-Bereiche (`gewaehltePlz`/`schaltePlz`) bringt Task 8 mit --
            // dort nachziehen, sonst sagt der Klickhinweis immer "zeigt nur".
            const text = punktText(punkt, false);
            return (
              <g
                key={punkt.zweisteller}
                className="plzknopf"
                aria-label={alsZeile(text)}
                onPointerEnter={zeigeTooltip(text)}
                onPointerLeave={verbergeTooltip}
                onFocus={zeigeTooltip(text)}
                onBlur={verbergeTooltip}
              >
                <circle
                  className="plzpunkt"
                  data-anker=""
                  cx={punkt.x}
                  cy={punkt.y}
                  r={radius(punkt.anzahl)}
                />
              </g>
            );
          })}

          {/*
            Das Overlay des Hovers: ein zusaetzlicher Ring, KEINE Aenderung an
            Kachel oder Punkt darunter (die Karte zeigt immer den ganzen
            Bestand). Es verschwindet mit dem Zeiger.
          */}
          {markierteLage !== undefined && (
            <rect
              className="markierung"
              x={markierteLage.x - markierteLage.breite / 2 - 3}
              y={markierteLage.y - markierteLage.hoehe / 2 - 3}
              width={markierteLage.breite + 6}
              height={markierteLage.hoehe + 6}
              rx={5}
              aria-hidden="true"
            />
          )}
          {markierterPunkt !== undefined && (
            <circle
              className="markierung"
              cx={markierterPunkt.x}
              cy={markierterPunkt.y}
              r={radius(markierterPunkt.anzahl) + 4}
              aria-hidden="true"
            />
          )}
        </svg>

        <p className="karte__hoverzeile">
          {hervorgehobenesObjekt === null ? "" : beschreibeMarkierung(markierung)}
        </p>

        <div className="karte__legende">
          <div className="skala">
            <span>
              {spanne === null
                ? "—"
                : groesse === "medianDscr"
                  ? formatiereDscr(spanne.min)
                  : formatiereAnzahl(spanne.min)}
            </span>
            <span
              className="skala__band"
              style={{
                background: "linear-gradient(90deg, rgba(227,165,69,0.09), rgba(227,165,69,0.77))",
              }}
            />
            <span>
              {spanne === null
                ? "—"
                : groesse === "medianDscr"
                  ? formatiereDscr(spanne.max)
                  : formatiereAnzahl(spanne.max)}
            </span>
            <span style={{ letterSpacing: "0.06em" }}>{KARTENGROESSE_NAMEN[groesse]}</span>
          </div>

          {/*
            DIE LEGENDE, DIE N2 AUSDRUECKLICH VERLANGT -- dauerhaft sichtbar
            und aus den Daten gerechnet, nicht in den Text geschrieben.
          */}
          <p className="abdeckung">
            <span className="abdeckung__punkt" />
            <b>{formatiereAnzahl(abdeckung.mitPlz)}</b> von{" "}
            <b>{formatiereAnzahl(abdeckung.gesamt)}</b> Objekten sind punktgenau verortbar (
            <b>{formatiereProzent(abdeckung.gesamt === 0 ? null : abdeckung.mitPlz / abdeckung.gesamt, 1)}</b>
            ). Die übrigen sind nur ihrem Bundesland zuzuordnen
            {abdeckung.ohneOrtsangabe > 0 && (
              <>
                {" "}
                — <b>{formatiereAnzahl(abdeckung.ohneOrtsangabe)}</b> tragen nicht einmal das und
                erscheinen auf dieser Karte überhaupt nicht
              </>
            )}
            .
          </p>

          <p className="hinweis-schematisch">
            Die 16 Kacheln sind <b>schematisch</b>: Sie liegen am PLZ-gewichteten Mittelpunkt
            ihres Landes, haben aber alle dieselbe Größe und zeichnen keine Grenze. Berlin und
            Hamburg sind versetzt, damit sie sich nicht überdecken — die dünne Linie zeigt, wohin
            sie gehören. Nur die goldenen Punkte stehen an einem echten Ort.
          </p>
          <p className="hinweis-schematisch">
            Die Karte zeigt <b>immer den ganzen Bestand</b>, nie die gefilterte Auswahl — sie ist
            der Einstieg in die Liste, nicht ihr Ergebnis. Ein Klick wählt ein Land aus (goldener
            Rahmen) und filtert die Liste.
          </p>
        </div>
      </div>

      {ziel !== null && <KartenTooltip ziel={ziel} />}
    </section>
  );
}
