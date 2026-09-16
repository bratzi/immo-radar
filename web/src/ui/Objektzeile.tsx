/**
 * Eine Zeile der Rangliste.
 *
 * Hier treffen die drei Zeichen des Nichtwissens aufeinander (Entwurf 1, 6.3):
 *
 *   abgaengig          ausgegraut      "beobachtet, dass es weg ist"
 *   unbestaetigt       gestrichelt     "hier hat niemand hingesehen"
 *   nicht beurteilbar  schraffiert     "darueber ist nichts bekannt"
 *
 * Drei Zustaende, drei Zeichen. Grau bedeutet deshalb GENAU EINE Sache -- und
 * die Verwechslung, vor der 6.3 warnt ("Beides in dieselbe Farbe zu legen
 * waere dieselbe Verwechslung wie DSCR 0,0 bei fehlender Wohnflaeche"), kann
 * gar nicht erst entstehen.
 *
 * DIE WICHTIGSTE ZEILE DIESER DATEI ist die Fallunterscheidung weiter unten:
 * Ein Objekt ohne Kennzahl bekommt KEINEN Bandstreifen, sondern an genau
 * derselben Stelle seine Gruende im Klartext (3.7). Es gibt keinen Zweig,
 * in dem dort eine 0 oder ein leeres Feld steht.
 */
import { memo } from "react";
import type { SnapshotObjekt } from "../daten/snapshot.ts";
import {
  alterInTagen,
  formatiereAnzahl,
  formatiereDatum,
  formatiereEuro,
  formatiereFlaeche,
  formatiereKaufpreisfaktor,
  formatiereTagesalter,
  preisJeQuadratmeter,
} from "../logik/formate.ts";
import { gruendeFuerAnzeige } from "../logik/gruende.ts";
import { Bandstreifen } from "./Bandstreifen.tsx";

const STUFENTEXT: Record<string, string> = {
  S3: "Miete belegt",
  S2: "Miete regional geschätzt (PLZ-genau)",
  S1: "Miete bundeslandweit geschätzt",
  S0: "nicht beurteilbar — keine Kennzahl",
};

const ZUSTANDSTEXT: Record<string, string> = {
  verfuegbar: "verfügbar",
  unbestaetigt: "unbestätigt",
  abgaengig: "abgängig",
};

interface Eigenschaften {
  objekt: SnapshotObjekt;
  rang: number | null;
  jetzt: Date;
  oben: number;
  /** `snapshot.konstanten.dscrMeldeschwelle` (A18-4) -- durchgereicht an den Bandstreifen. */
  dscrMeldeschwelle: number;
}

function ObjektzeileRoh({ objekt, rang, jetzt, oben, dscrMeldeschwelle }: Eigenschaften) {
  const ohneKennzahl = objekt.rangzahl === null;
  const alter = alterInTagen(objekt.zuletztGesehen, jetzt);
  const jeQm = preisJeQuadratmeter(objekt.kaufpreisEuro, objekt.wohnflaecheM2);

  const klassen = [
    "zeile",
    rang === null ? "zeile--ohne-rang" : "",
    objekt.trefferklasse === "top" ? "zeile--top" : "",
    objekt.zustand === "abgaengig" ? "zeile--abgaengig" : "",
    objekt.zustand === "unbestaetigt" ? "zeile--unbestaetigt" : "",
    ohneKennzahl ? "zeile--unklar" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const inhalt = (
    <>
      {rang !== null && <span className="zeile__rang">{formatiereAnzahl(rang)}</span>}

      <span className="zeile__sache">
        <span className="zeile__titel">
          {objekt.titel ?? "Ohne Titel — die Quelle nennt keinen"}
        </span>
        <span className="zeile__ort">
          <span>
            {objekt.ort ?? "Ort unbekannt"}
            {objekt.bundesland !== null && ` · ${objekt.bundesland}`}
            {objekt.plz !== null && ` · ${objekt.plz}`}
          </span>
          {objekt.quelle === "zvg-portal" && <span className="marker marker--zvg">ZVG</span>}
          {objekt.preisGesenkt && <span className="marker marker--senkung">Preis gesenkt</span>}
          {objekt.termin !== null && (
            <span className="marker marker--termin">Termin {formatiereDatum(objekt.termin)}</span>
          )}
          {objekt.einheiten !== null && objekt.einheitenAngenommen && (
            <span className="marker marker--angenommen">
              {objekt.einheiten} Einheiten (angenommen)
            </span>
          )}
        </span>
      </span>

      <span className="zeile__zahlen">
        <span className="zeile__preis">{formatiereEuro(objekt.kaufpreisEuro)}</span>
        <span className="zeile__neben">
          {formatiereFlaeche(objekt.wohnflaecheM2)}
          {jeQm !== null && ` · ${formatiereEuro(Math.round(jeQm))}/m²`}
          {/*
            Der Kaufpreisfaktor: die dritte nuetzliche Zahl (Entwurf 2.3 --
            "steht daneben, ordnet aber nicht"). Er haengt an dieser Spalte
            (Preis · Flaeche), NICHT an der DSCR-Spalte -- die Spaltenkopf-
            Ueberschrift ("Preis · Fläche") wuerde bei drei Begriffen in der
            festen 112px-Spalte umbrechen (Review M-1), deshalb traegt die
            Zahl selbst ein `title`, statt die Ueberschrift zu erweitern.
          */}
          {objekt.kaufpreisfaktor !== null && (
            <>
              {" · "}
              <span title="Kaufpreisfaktor">
                {formatiereKaufpreisfaktor(objekt.kaufpreisfaktor)}
              </span>
            </>
          )}
        </span>
      </span>

      {/*
        DIE Fallunterscheidung. Keine Kennzahl heisst: kein Zahlenfeld, kein
        Balken, keine 0 -- sondern der Grund im Klartext, an genau derselben
        Stelle, an der sonst die Kennzahl stuende.
      */}
      {ohneKennzahl ? (
        <span className="gruende">
          {gruendeFuerAnzeige(objekt).map((grund) => (
            <span
              key={grund.text}
              className={`grund${grund.istKlartext ? "" : " grund--code"}`}
              title={grund.text}
            >
              {grund.text}
            </span>
          ))}
        </span>
      ) : (
        <Bandstreifen objekt={objekt} dscrMeldeschwelle={dscrMeldeschwelle} />
      )}

      <span className="zeile__abzeichen">
        <span
          className={`abzeichen abzeichen--${objekt.stufe.toLowerCase()}`}
          title={STUFENTEXT[objekt.stufe] ?? objekt.stufe}
        >
          {objekt.stufe}
        </span>
        <span
          className={`zustandsmarke zustandsmarke--${objekt.zustand}`}
          title={
            objekt.zustand === "abgaengig"
              ? `abgängig seit ${formatiereDatum(objekt.abgaengigSeit)}`
              : `zuletzt bestätigt ${formatiereTagesalter(alter)}`
          }
        >
          <i />
          {objekt.zustand === "abgaengig"
            ? formatiereDatum(objekt.abgaengigSeit)
            : formatiereTagesalter(alter)}
        </span>
      </span>
    </>
  );

  const stil = { top: `${oben}px` };
  const beschriftung = `${objekt.titel ?? "Objekt"} — ${
    STUFENTEXT[objekt.stufe] ?? objekt.stufe
  }, ${ZUSTANDSTEXT[objekt.zustand] ?? objekt.zustand}`;

  // Ohne URL kein Verweis: Ein Anker ohne Ziel sieht anklickbar aus und ist
  // es nicht. Dann steht dort dieselbe Zeile als reines Feld.
  return objekt.url === null ? (
    <div className={klassen} style={stil} aria-label={beschriftung}>
      {inhalt}
    </div>
  ) : (
    <a
      className={klassen}
      style={stil}
      href={objekt.url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={beschriftung}
    >
      {inhalt}
    </a>
  );
}

/**
 * Memoisiert: Beim Blaettern durch 18.335 Zeilen aendert sich je Bild nur
 * eine Handvoll Zeilen, aber React wuerde sonst alle sichtbaren neu bauen.
 */
export const Objektzeile = memo(ObjektzeileRoh);
