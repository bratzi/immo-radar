/**
 * Ein sichtbarer Bereich der Seite (Nachtrag N1).
 *
 * Drei Bereiche nach TREFFERKLASSE -- Top-Treffer, normale Treffer, nicht
 * beurteilbar -- plus die Abgaenge aus 6.4. Die Sicherheitsstufe ist ein
 * Abzeichen am Objekt und ein Filter, NICHT die Gliederung.
 *
 * Jeder Bereich traegt seine Zahl aus den Daten und eine Zeile, die sagt,
 * was er ist. Die Bereiche "Nicht beurteilbar" und "Abgaenge" bekommen
 * KEINE Rangspalte: Sie sind nicht nach Rang geordnet (3.7 sortiert nach
 * `last_seen`, 6.4 nach dem Abgangsdatum), und eine Rangnummer daneben
 * behauptete eine Ordnung, die es dort nicht gibt.
 */
import type { SnapshotObjekt } from "../daten/snapshot.ts";
import { formatiereAnzahl } from "../logik/formate.ts";
import { Objektzeile } from "./Objektzeile.tsx";
import { Skalenkopf } from "./Bandstreifen.tsx";
import { VirtuelleListe } from "./VirtuelleListe.tsx";

/** Hoehe, ab der ein Bereich selbst blaettert statt die Seite zu verlaengern. */
const MAX_LISTENHOEHE = 660;

interface Eigenschaften {
  name: string;
  erlaeuterung: string;
  objekte: readonly SnapshotObjekt[];
  /** Zeigt eine Rangspalte -- nur dort, wo nach Rang sortiert ist. */
  mitRang: boolean;
  /** Zeigt die DSCR-Achse -- nur dort, wo Objekte ueberhaupt eine Rangzahl tragen. */
  mitSkala?: boolean;
  hervorgehoben?: boolean;
  offen: boolean;
  umschalten: () => void;
  jetzt: Date;
  zeilenhoehe: number;
  /** Was steht da, wenn nichts da ist. Nie "keine Treffer" ohne Grund. */
  leertext: React.ReactNode;
}

export function Bereich({
  name,
  erlaeuterung,
  objekte,
  mitRang,
  mitSkala = true,
  hervorgehoben = false,
  offen,
  umschalten,
  jetzt,
  zeilenhoehe,
  leertext,
}: Eigenschaften) {
  const kennung = `bereich-${name.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <section
      className={`bereich${hervorgehoben ? " bereich--top" : ""}${offen ? " bereich--offen" : ""}`}
    >
      <button
        type="button"
        className="bereich__kopf"
        onClick={umschalten}
        aria-expanded={offen}
        aria-controls={kennung}
      >
        <span className="bereich__pfeil" aria-hidden="true">
          ▶
        </span>
        <h2 className="bereich__name">{name}</h2>
        <span className="bereich__zahl">{formatiereAnzahl(objekte.length)}</span>
        <span className="bereich__erlaeuterung">{erlaeuterung}</span>
      </button>

      {offen && (
        <div id={kennung}>
          {objekte.length === 0 ? (
            <div className="leer">{leertext}</div>
          ) : (
            <>
              <Skalenkopf mitRang={mitRang} mitSkala={mitSkala} />
              <VirtuelleListe
                eintraege={objekte}
                zeilenhoehe={zeilenhoehe}
                maxHoehe={MAX_LISTENHOEHE}
                schluessel={(objekt) => objekt.id}
                zeichne={(objekt, index, oben) => (
                  <Objektzeile
                    objekt={objekt}
                    rang={mitRang ? index + 1 : null}
                    jetzt={jetzt}
                    oben={oben}
                  />
                )}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
