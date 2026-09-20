/**
 * Das Dashboard.
 *
 * DER DATENWEG IST DER BESCHLOSSENE (Entwurf 5.3, N4): eine einzige
 * veroeffentlichte Datei. Kein Supabase-Client, kein Schluessel, keine
 * Datenbankverbindung, keine Fremdanfrage zur Laufzeit. Wer diese Datei nach
 * Netzaufrufen durchsucht, findet genau einen: `fetch` auf
 * `dashboard-snapshot.json`.
 */
import { useEffect, useMemo, useState } from "react";
import type { Snapshot, SnapshotObjekt } from "./daten/snapshot.ts";
import { ladeSnapshot, type Ladefortschritt, type Ladeergebnis } from "./daten/laden.ts";
import {
  LEERER_FILTER,
  schalteEintrag,
  wendeFilterAn,
  zaehleOhneAngabe,
  type Filter,
} from "./logik/filter.ts";
import { bestimmeBereich, gliedere } from "./logik/gliederung.ts";
import { laenderOhneAbgangserkennung, zaehleZustaende } from "./logik/regionen.ts";
import type { Kartengroesse } from "./logik/karte.ts";
import { formatiereAnzahl, formatiereDatumZeit } from "./logik/formate.ts";
import { Kopfzeile } from "./ui/Kopfzeile.tsx";
import { Filterleiste } from "./ui/Filterleiste.tsx";
import { Karte } from "./ui/Karte.tsx";
import { Betriebstafel } from "./ui/Betriebstafel.tsx";
import { Bereich } from "./ui/Bereich.tsx";
import { useZeilenhoehe } from "./ui/VirtuelleListe.tsx";

type Bereichsname = "top" | "normal" | "nichtBeurteilbar" | "abgaenge";

function zaehle<T>(objekte: readonly T[], schluessel: (o: T) => string | null): Map<string, number> {
  const zaehler = new Map<string, number>();
  for (const objekt of objekte) {
    const wert = schluessel(objekt);
    if (wert === null) continue;
    zaehler.set(wert, (zaehler.get(wert) ?? 0) + 1);
  }
  return zaehler;
}

export function App() {
  const [fortschritt, setFortschritt] = useState<Ladefortschritt | null>(null);
  const [ergebnis, setErgebnis] = useState<Ladeergebnis | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let abgebrochen = false;
    ladeSnapshot((f) => {
      if (!abgebrochen) setFortschritt(f);
    })
      .then((geladen) => {
        if (!abgebrochen) setErgebnis(geladen);
      })
      .catch((ursache: unknown) => {
        if (!abgebrochen) {
          setFehler(ursache instanceof Error ? ursache.message : String(ursache));
        }
      });
    return () => {
      abgebrochen = true;
    };
  }, []);

  if (fehler !== null) {
    return (
      <div className="laden">
        <div className="fehler">
          <h2>Die Daten sind nicht da</h2>
          <p style={{ margin: 0 }}>{fehler}</p>
          <p style={{ marginBottom: 0 }}>
            Die Oberfläche liest ausschließlich eine veröffentlichte Datei und spricht nie mit der
            Datenbank. Fehlt die Datei, gibt es nichts zu zeigen — und es wird nichts erfunden.
          </p>
        </div>
      </div>
    );
  }

  if (ergebnis === null) {
    return <Ladeanzeige fortschritt={fortschritt} />;
  }

  return <Dashboard ergebnis={ergebnis} />;
}

function Ladeanzeige({ fortschritt }: { fortschritt: Ladefortschritt | null }) {
  const gesamt = fortschritt?.gesamt ?? null;
  const gelesen = fortschritt?.gelesen ?? 0;
  const anteil = gesamt !== null && gesamt > 0 ? Math.min(1, gelesen / gesamt) : null;
  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

  return (
    <div className="laden">
      <span className="laden__marke">immo · radar</span>
      <span className="laden__phase">
        {fortschritt?.phase === "aufbereitung" ? "Daten werden aufbereitet …" : "Daten werden geladen …"}
      </span>
      <div className={`laden__balken${anteil === null ? " laden__balken--unbekannt" : ""}`}>
        <i style={{ width: anteil === null ? "34%" : `${(anteil * 100).toFixed(1)}%` }} />
      </div>
      <span className="laden__zahl">
        {gesamt === null
          ? `${mb(gelesen)} MB gelesen`
          : `${mb(gelesen)} von ${mb(gesamt)} MB`}
      </span>
    </div>
  );
}

function Dashboard({ ergebnis }: { ergebnis: Ladeergebnis }) {
  const snapshot: Snapshot = ergebnis.snapshot;
  const alleObjekte = snapshot.objekte;

  const [filter, setFilter] = useState<Filter>(LEERER_FILTER);
  const [kartengroesse, setKartengroesse] = useState<Kartengroesse>("objekte");
  const [offen, setOffen] = useState<Record<Bereichsname, boolean>>({
    top: true,
    normal: true,
    nichtBeurteilbar: false,
    abgaenge: false,
  });
  const [hoverObjekt, setHoverObjekt] = useState<SnapshotObjekt | null>(null);
  // Ein `pointerleave` feuert NICHT, wenn die Zeile unter dem Zeiger
  // verschwindet -- Filterwechsel, Bereich zugeklappt. Ohne dieses Aufraeumen
  // zeigte die Karte danach auf ein Objekt, das in der Liste gar nicht mehr
  // steht.
  useEffect(() => {
    setHoverObjekt(null);
  }, [filter, offen]);

  const zeilenhoehe = useZeilenhoehe();

  /**
   * EINE Uhr fuer die ganze Seite, und zwar die des Snapshots -- nicht
   * `new Date()`. Sonst wanderte die Karenzgrenze aus 6.4 waehrend des
   * Betrachtens, und "vor 6 Tagen" haetten zwei Zeilen verschieden gerechnet.
   * Faellt der Zeitstempel aus, wird die echte Uhr genommen; der Fussbereich
   * sagt dann, welche gilt.
   */
  const jetzt = useMemo(() => {
    const zeit = Date.parse(snapshot.erzeugtAm);
    return Number.isFinite(zeit) ? new Date(zeit) : new Date();
  }, [snapshot.erzeugtAm]);

  const karenzTage = snapshot.konstanten.karenzTage;
  const dscrMeldeschwelle = snapshot.konstanten.dscrMeldeschwelle;

  const gefiltert = useMemo(() => wendeFilterAn(alleObjekte, filter), [alleObjekte, filter]);
  const gliederung = useMemo(
    () => gliedere(gefiltert, jetzt, karenzTage),
    [gefiltert, jetzt, karenzTage]
  );

  // Die Zaehlungen an den Filterknoepfen gelten fuer den GESAMTEN Bestand,
  // nicht fuer die laufende Auswahl: Sie sollen sagen, was es gibt, nicht
  // was gerade uebrig ist -- sonst zeigte ein Knopf "0", sobald ein anderer
  // Filter greift, und saehe aus wie "gibt es nicht".
  const zaehlungen = useMemo(
    () => ({
      bundesland: zaehle(alleObjekte, (o: SnapshotObjekt) => o.bundesland),
      stufe: zaehle(alleObjekte, (o: SnapshotObjekt) => o.stufe),
      zustand: zaehle(alleObjekte, (o: SnapshotObjekt) => o.zustand),
      quelle: zaehle(alleObjekte, (o: SnapshotObjekt) => o.quelle),
    }),
    [alleObjekte]
  );

  const datenluecken = useMemo(() => {
    const zaehler = new Map<string, number>();
    for (const objekt of alleObjekte) {
      for (const luecke of objekt.datenluecken) {
        zaehler.set(luecke, (zaehler.get(luecke) ?? 0) + 1);
      }
    }
    return [...zaehler.entries()]
      .map(([text, anzahl]) => ({ text, anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl);
  }, [alleObjekte]);

  const ohneAngabe = useMemo(() => zaehleOhneAngabe(alleObjekte), [alleObjekte]);

  const bundeslandNamen = useMemo(
    () => snapshot.bundeslaender.map((land) => land.name),
    [snapshot.bundeslaender]
  );

  /**
   * Laender, aus denen ueber die Hauptquelle kein Abgang erkannt wurde
   * (Entwurf 6.2/6.3) -- AUS DEN DATEN abgeleitet, Herleitung und Gegenprobe
   * stehen an `laenderOhneAbgangserkennung`.
   */
  const laenderOhneAbgang = useMemo(() => laenderOhneAbgangserkennung(alleObjekte), [alleObjekte]);
  const zustaendeGesamt = useMemo(() => zaehleZustaende(alleObjekte), [alleObjekte]);

  /**
   * Die Zahl fuer die Kopfzeile wird ueber den GESAMTEN Bestand gerechnet,
   * nicht ueber die Auswahl: Die Kopfzeile ist eine Aussage ueber den
   * Bestand (3.9), und ihre uebrigen Zahlen kommen aus `snapshot.kopfzeile`.
   * Eine gefilterte Zahl zwischen ungefilterten waere genau der Zustand, den
   * dieses Projekt "zwei Staende nebeneinander" nennt.
   */
  const topImBestand = useMemo(
    () =>
      alleObjekte.reduce(
        (summe, o) => summe + (bestimmeBereich(o, jetzt, karenzTage) === "top" ? 1 : 0),
        0
      ),
    [alleObjekte, jetzt, karenzTage]
  );

  const schalteLand = (name: string) =>
    setFilter((bisher) => ({
      ...bisher,
      bundeslaender: schalteEintrag(bisher.bundeslaender, name),
    }));

  const schaltePlz = (zweisteller: string) =>
    setFilter((bisher) => ({
      ...bisher,
      plzZweisteller: schalteEintrag(bisher.plzZweisteller, zweisteller),
    }));

  const umschalten = (bereich: Bereichsname) =>
    setOffen((bisher) => ({ ...bisher, [bereich]: !bisher[bereich] }));

  const nichtsUebrig = gefiltert.length === 0 && alleObjekte.length > 0;

  return (
    <div className="geruest">
      {/*
        Vor der Liste liegen rund 76 Tab-Stopps (16 Kacheln, bis zu 60 Punkte,
        dazu die Filterleiste). Der Sprunglink ueberspringt sie in einem Schritt.
      */}
      <a className="sprunglink" href="#liste">
        Zur Liste springen
      </a>
      <Kopfzeile snapshot={snapshot} topAnzahl={topImBestand} />

      <aside className="rail">
        <Filterleiste
          filter={filter}
          setzeFilter={setFilter}
          bundeslaender={bundeslandNamen}
          anzahlJeBundesland={zaehlungen.bundesland}
          anzahlJeStufe={zaehlungen.stufe}
          anzahlJeZustand={zaehlungen.zustand}
          anzahlJeQuelle={zaehlungen.quelle}
          datenluecken={datenluecken}
          ohneAngabe={ohneAngabe}
          gesamt={alleObjekte.length}
          laenderOhneAbgang={laenderOhneAbgang}
          zustaendeGesamt={zustaendeGesamt}
        />
      </aside>

      {/*
        Ein <div> statt <aside>: Die Karte traegt schon ein eigenes <section>
        mit Ueberschrift; ein zweites Landmark neben der Filterleiste waere
        Rauschen.
      */}
      <div className="kartenspalte">
        <Karte
          bundeslaender={snapshot.bundeslaender}
          alleObjekte={alleObjekte}
          groesse={kartengroesse}
          setzeGroesse={setKartengroesse}
          gewaehlteLaender={filter.bundeslaender}
          schalteLand={schalteLand}
          gewaehltePlz={filter.plzZweisteller}
          schaltePlz={schaltePlz}
          hervorgehobenesObjekt={hoverObjekt}
        />
      </div>

      <main className="haupt" id="liste" tabIndex={-1}>
        <Betriebstafel betrieb={snapshot.betrieb} jetzt={jetzt} />

        {nichtsUebrig && (
          <div className="bereich">
            <div className="leer">
              <b>Kein Objekt passt zu dieser Auswahl.</b> Das heißt nicht, dass es keine gibt —
              es heißt, dass diese Kombination im Bestand vom{" "}
              {formatiereDatumZeit(snapshot.erzeugtAm)} nicht vorkommt. Die Zahlen an den
              Filterknöpfen gelten für den gesamten Bestand und zeigen, wo etwas zu holen wäre.
            </div>
          </div>
        )}

        <Bereich
          name="Top-Treffer"
          erlaeuterung="halten die Meldeschwelle auch an der unteren Bandkante"
          objekte={gliederung.top}
          mitRang
          hervorgehoben
          offen={offen.top}
          umschalten={() => umschalten("top")}
          jetzt={jetzt}
          zeilenhoehe={zeilenhoehe}
          dscrMeldeschwelle={dscrMeldeschwelle}
          onHover={setHoverObjekt}
          leertext={
            <>
              <b>Kein Objekt hält die Schwelle an der unteren Bandkante.</b> Das ist eine Aussage
              über die Datenlage, nicht über den Markt: Fast jede Bewertung beruht auf einer
              geschätzten Miete, und ein Objekt gilt hier erst dann als Top-Treffer, wenn es auch
              dann noch trägt, wenn die Schätzung gegen es läuft.
            </>
          }
        />

        <Bereich
          name="Normale Treffer"
          erlaeuterung="haben eine Rangzahl, halten die Schwelle aber nicht — oder nur im Band"
          objekte={gliederung.normal}
          mitRang
          offen={offen.normal}
          umschalten={() => umschalten("normal")}
          jetzt={jetzt}
          zeilenhoehe={zeilenhoehe}
          dscrMeldeschwelle={dscrMeldeschwelle}
          onHover={setHoverObjekt}
          leertext={<b>Kein Objekt mit Rangzahl passt zu dieser Auswahl.</b>}
        />

        <Bereich
          name="Nicht beurteilbar"
          erlaeuterung="tragen keine Kennzahl — an ihrer Stelle steht der Grund; nach zuletzt gesehen geordnet"
          objekte={gliederung.nichtBeurteilbar}
          mitRang={false}
          mitSkala={false}
          offen={offen.nichtBeurteilbar}
          umschalten={() => umschalten("nichtBeurteilbar")}
          jetzt={jetzt}
          zeilenhoehe={zeilenhoehe}
          dscrMeldeschwelle={dscrMeldeschwelle}
          onHover={setHoverObjekt}
          leertext={
            <>
              <b>Kein Objekt ohne Kennzahl in dieser Auswahl.</b> Über diese Objekte ist nichts
              bekannt — sie sind nicht schlecht bewertet, sondern gar nicht bewertbar.
            </>
          }
        />

        <Bereich
          name="Abgänge"
          erlaeuterung="seit über zwei Tagen verschwunden — die Karenz ist vorbei, die Zeile bleibt"
          objekte={gliederung.abgaenge}
          mitRang={false}
          offen={offen.abgaenge}
          umschalten={() => umschalten("abgaenge")}
          jetzt={jetzt}
          zeilenhoehe={zeilenhoehe}
          dscrMeldeschwelle={dscrMeldeschwelle}
          onHover={setHoverObjekt}
          leertext={
            <>
              <b>Kein Abgang in dieser Auswahl.</b> Aus Regionen, die ihre Trefferzahl nicht
              ausweisen, wird ohnehin nie ein Abgang erkannt — dort steht „unbestätigt“ statt
              „abgängig“.
            </>
          }
        />

        <footer className="fuss">
          <span>Snapshot {formatiereDatumZeit(snapshot.erzeugtAm)}</span>
          <span>{formatiereAnzahl(alleObjekte.length)} Objekte</span>
          <span>{formatiereAnzahl(gefiltert.length)} nach Filter</span>
          <span>{(ergebnis.messung.bytes / 1024 / 1024).toFixed(2)} MB</span>
          <span>Abruf {Math.round(ergebnis.messung.abrufMs)} ms</span>
          <span>Parsen {Math.round(ergebnis.messung.parseMs)} ms</span>
          <span>
            Alle Zeitangaben gegen den Snapshot-Zeitpunkt gerechnet, nicht gegen die Uhr dieses
            Rechners.
          </span>
        </footer>
      </main>
    </div>
  );
}
