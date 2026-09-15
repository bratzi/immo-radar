/**
 * Die Betriebsseite (Entwurf, Abschnitt 8) -- als Tafel neben der Karte,
 * nicht als eigene Seite: Sie beantwortet dieselbe Frage wie die Karte,
 * naemlich "wann wurde wo zuletzt hingesehen", und gehoert deshalb daneben.
 *
 * Drei Groessen, die den LAUF beschreiben und nicht ein Objekt. Zwei davon
 * kennt nur ein Lauf selbst (uebersprungene Objekte je Lauf, Meldebudget);
 * ein Export ausserhalb eines Laufs schreibt dort `null` und NICHT 0 -- 0
 * hiesse "nichts uebersprungen", eine Behauptung aus Nichtwissen. Diese
 * Tafel sagt das dann auch so, statt eine leere Kachel zu zeigen.
 */
import type { SnapshotBetrieb } from "../daten/snapshot.ts";
import { formatiereAnzahl, formatiereDatumZeit, formatiereTagesalter } from "../logik/formate.ts";
import { alterInTagen } from "../logik/formate.ts";

interface Eigenschaften {
  betrieb: SnapshotBetrieb;
  jetzt: Date;
}

export function Betriebstafel({ betrieb, jetzt }: Eigenschaften) {
  const uebersprungen = betrieb.uebersprungeneJeLauf;
  const budget = betrieb.meldebudget;
  const unvollstaendige = betrieb.regionsstand.filter((stand) => !stand.vollstaendig).length;

  return (
    <section className="tafel">
      <div className="tafel__kopf">
        <h2 className="tafel__titel">Betrieb</h2>
        <span className="marke__stand">
          {formatiereAnzahl(betrieb.regionsstand.length)} Regionen
        </span>
      </div>

      <div className="tafel__inhalt" style={{ display: "grid", gap: 14 }}>
        <div className="betrieb__gitter">
          {betrieb.regionsstand.map((stand) => {
            const alter = alterInTagen(stand.letzterLauf, jetzt);
            return (
              <div
                key={stand.region}
                className={`region${stand.vollstaendig ? "" : " region--unvollstaendig"}`}
                title={
                  `${stand.region.toUpperCase()} — letzter Lauf ` +
                  `${formatiereDatumZeit(stand.letzterLauf)}, ` +
                  (stand.vollstaendig ? "vollständig" : "unvollständig")
                }
              >
                <span className="region__name">{stand.region.toUpperCase()}</span>
                <span className="region__zeit">{formatiereTagesalter(alter)}</span>
                <span className="region__zeit">{formatiereDatumZeit(stand.letzterLauf)}</span>
              </div>
            );
          })}
        </div>

        {/*
          Die Zahl statt fuenfzehnmal derselben Marke: "zuletzt
          unvollstaendig" an fast jeder Kachel markiert nichts mehr (die
          Lehre aus 3.6). Der gestrichelte Rand bleibt, die Erklaerung steht
          einmal.
        */}
        {unvollstaendige > 0 && (
          <p className="abdeckung">
            <b>{formatiereAnzahl(unvollstaendige)}</b> von{" "}
            <b>{formatiereAnzahl(betrieb.regionsstand.length)}</b> Regionen haben ihren letzten
            Sweep <b>nicht zu Ende gebracht</b> (gestrichelte Kante). Das ist der Normalfall — der
            Lauf endet am Zeitbudget, nicht am Ende der Liste. Es heißt aber auch: Aus diesen
            Regionen kann in diesem Durchgang kein Abgang bestätigt worden sein.
          </p>
        )}

        {/*
          Fehlanzeige statt leerer Kachel. Der Unterschied zwischen "0
          uebersprungen" und "diese Zahl kennt nur ein Lauf" ist genau der
          Unterschied, den dieses Projekt ueberall sonst auch macht.
        */}
        {uebersprungen === null || budget === null ? (
          <p className="fehlanzeige">
            {uebersprungen === null && budget === null
              ? "Übersprungene Objekte und Meldebudget stehen in keiner Tabelle — sie sind Laufkennwerte. Dieser Snapshot wurde außerhalb eines Laufs erzeugt und nennt sie deshalb gar nicht. Das ist keine Null."
              : "Ein Teil der Laufkennwerte fehlt: Was hier nicht steht, hat der erzeugende Lauf nicht mitgeliefert — es ist keine Null."}
          </p>
        ) : null}

        {uebersprungen !== null && (
          <p className="abdeckung">
            Übersprungen im letzten Lauf: <b>{formatiereAnzahl(uebersprungen.preis_auf_anfrage)}</b>{" "}
            Preis auf Anfrage, <b>{formatiereAnzahl(uebersprungen.preis_unlesbar)}</b> Preis
            unlesbar. Eine steigende Quote „unlesbar“ ist ein Fehler, eine steigende Quote „auf
            Anfrage“ ist Markt.
          </p>
        )}

        {budget !== null && (
          <p className="abdeckung">
            Meldungen: <b>{formatiereAnzahl(budget.gesendet)}</b> von höchstens{" "}
            <b>{formatiereAnzahl(budget.hoechstens)}</b>, <b>{formatiereAnzahl(budget.zurueckgestellt)}</b>{" "}
            zurückgestellt.
          </p>
        )}
      </div>
    </section>
  );
}
