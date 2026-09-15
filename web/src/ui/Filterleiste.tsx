/**
 * Die Filter aus N3 -- und nur die.
 *
 * Es gibt hier ABSICHTLICH kein Suchfeld und keinen Zimmerzahl-Filter. N3
 * zaehlt die Filter einzeln auf, jeder ist gegen eine vorhandene Spalte
 * geprueft, und der Auftrag lautet: nur bauen, was dort steht. Die
 * Zimmerzahl steht im Titel, aber in keiner Spalte; ein Filter darauf wuerde
 * jeden Titel ohne Zimmerangabe als "0 Zimmer" filterbar machen.
 *
 * DIE BESONDERHEIT DIESER LEISTE steht an den Spannenfeldern: Jedes nennt
 * DAUERHAFT, wie viele Objekte gar keine Angabe tragen und deshalb
 * herausfielen. Bei "Baujahr" sind das 18.277 von 18.335 (99,7 %). Ohne
 * diese Zeile waere der Filter eine Falle -- man setzte "ab 1900" und der
 * Bestand verschwaende, ohne dass irgendwo stuende, warum.
 */
import { useState, type ReactNode } from "react";
import type { Sicherheitsstufe, Verfuegbarkeitszustand } from "../daten/snapshot.ts";
import type { Filter, OhneAngabe } from "../logik/filter.ts";
import { LEERER_FILTER, istFilterAktiv } from "../logik/filter.ts";
import type { Zustandszaehlung } from "../logik/regionen.ts";
import { formatiereAnzahl, formatiereProzent } from "../logik/formate.ts";

const STUFEN: { wert: Sicherheitsstufe; name: string; titel: string }[] = [
  { wert: "S3", name: "S3", titel: "Miete belegt" },
  { wert: "S2", name: "S2", titel: "Miete regional geschätzt (PLZ-genau)" },
  { wert: "S1", name: "S1", titel: "Miete bundeslandweit geschätzt" },
  { wert: "S0", name: "S0", titel: "nicht beurteilbar — keine Kennzahl" },
];

const ZUSTAENDE: { wert: Verfuegbarkeitszustand; name: string; titel: string }[] = [
  { wert: "verfuegbar", name: "verfügbar", titel: "zuletzt innerhalb der Regionskadenz gesehen" },
  {
    wert: "unbestaetigt",
    name: "unbestätigt",
    titel: "hier hat niemand hingesehen — nicht: es ist weg",
  },
  { wert: "abgaengig", name: "abgängig", titel: "beobachtet, dass es weg ist" },
];

const QUELLEN: { wert: string; name: string }[] = [
  { wert: "immowelt", name: "Immowelt" },
  { wert: "zvg-portal", name: "Zwangsversteigerung" },
];

interface Eigenschaften {
  filter: Filter;
  setzeFilter: (filter: Filter) => void;
  bundeslaender: readonly string[];
  /** Zaehlungen ueber den GESAMTEN Bestand, nicht ueber die aktuelle Auswahl. */
  anzahlJeBundesland: ReadonlyMap<string, number>;
  anzahlJeStufe: ReadonlyMap<string, number>;
  anzahlJeZustand: ReadonlyMap<string, number>;
  anzahlJeQuelle: ReadonlyMap<string, number>;
  datenluecken: readonly { text: string; anzahl: number }[];
  ohneAngabe: OhneAngabe;
  gesamt: number;
  /** Laender, aus denen ueber die Hauptquelle kein Abgang erkannt wurde. */
  laenderOhneAbgang: readonly string[];
  zustaendeGesamt: Zustandszaehlung;
}

function Gruppe({
  name,
  zaehler,
  offenAnfangs = false,
  children,
}: {
  name: string;
  zaehler?: number;
  offenAnfangs?: boolean;
  children: ReactNode;
}) {
  const [offen, setOffen] = useState(offenAnfangs);
  return (
    <div className={`gruppe${offen ? " gruppe--offen" : ""}`}>
      <button
        type="button"
        className="gruppe__knopf"
        onClick={() => setOffen(!offen)}
        aria-expanded={offen}
      >
        <span className="gruppe__pfeil" aria-hidden="true">
          ▶
        </span>
        <span className="gruppe__name">{name}</span>
        {zaehler !== undefined && zaehler > 0 && (
          <span className="gruppe__zaehler">{formatiereAnzahl(zaehler)}</span>
        )}
      </button>
      {offen && <div className="gruppe__inhalt">{children}</div>}
    </div>
  );
}

function Spannenfeld({
  beschriftung,
  einheit,
  von,
  bis,
  ohneAngabe,
  gesamt,
  setze,
}: {
  beschriftung: string;
  einheit: string;
  von: number | null;
  bis: number | null;
  ohneAngabe: number;
  gesamt: number;
  setze: (von: number | null, bis: number | null) => void;
}) {
  const aktiv = von !== null || bis !== null;
  const lies = (text: string): number | null => {
    const getrimmt = text.trim();
    if (getrimmt === "") return null;
    const zahl = Number(getrimmt.replace(",", "."));
    return Number.isFinite(zahl) ? zahl : null;
  };

  return (
    <div className={`spanne${aktiv ? " spanne--wirksam" : ""}`}>
      <span className="spanne__beschriftung">
        <span>{beschriftung}</span>
        <span style={{ color: "var(--papier-still)", fontSize: "10px" }}>{einheit}</span>
      </span>
      <div className="spanne__felder">
        <input
          type="text"
          inputMode="decimal"
          placeholder="von"
          aria-label={`${beschriftung} von`}
          defaultValue={von ?? ""}
          onBlur={(e) => setze(lies(e.currentTarget.value), bis)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <span className="spanne__bis">bis</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="bis"
          aria-label={`${beschriftung} bis`}
          defaultValue={bis ?? ""}
          onBlur={(e) => setze(von, lies(e.currentTarget.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </div>
      {/*
        Die Zeile, ohne die dieser Filter eine Falle waere.
      */}
      {ohneAngabe > 0 && (
        <span className="spanne__preis">
          <b>{formatiereAnzahl(ohneAngabe)}</b> von {formatiereAnzahl(gesamt)} Objekten tragen
          keine Angabe und fallen heraus, sobald hier etwas steht
          {aktiv ? " — sie sind gerade ausgeblendet." : "."}
        </span>
      )}
    </div>
  );
}

function Wahlknopf({
  name,
  titel,
  anzahl,
  gewaehlt,
  marke = false,
  umschalten,
}: {
  name: string;
  titel?: string;
  anzahl: number | undefined;
  gewaehlt: boolean;
  /** Gestrichelte Kante: aus diesem Land ist kein Abgang erkannt worden. */
  marke?: boolean;
  umschalten: () => void;
}) {
  return (
    <button
      type="button"
      className={`wahl__knopf${anzahl === 0 ? " wahl__knopf--leer" : ""}${
        marke ? " wahl__knopf--ohne-abgang" : ""
      }`}
      aria-pressed={gewaehlt}
      onClick={umschalten}
      {...(titel === undefined ? {} : { title: titel })}
    >
      {name}
      {anzahl !== undefined && <i>{formatiereAnzahl(anzahl)}</i>}
    </button>
  );
}

export function Filterleiste({
  filter,
  setzeFilter,
  bundeslaender,
  anzahlJeBundesland,
  anzahlJeStufe,
  anzahlJeZustand,
  anzahlJeQuelle,
  datenluecken,
  ohneAngabe,
  gesamt,
  laenderOhneAbgang,
  zustaendeGesamt,
}: Eigenschaften) {
  const aendere = (teil: Partial<Filter>) => setzeFilter({ ...filter, ...teil });

  const schalteAuswahl = <T extends string>(liste: readonly T[], wert: T): T[] =>
    liste.includes(wert) ? liste.filter((e) => e !== wert) : [...liste, wert];

  return (
    <div className="filter">
      <div className="filter__kopf">
        <h2 className="filter__titel">Filter</h2>
        <button
          type="button"
          className="filter__zuruecksetzen"
          disabled={!istFilterAktiv(filter)}
          onClick={() => setzeFilter(LEERER_FILTER)}
        >
          zurücksetzen
        </button>
      </div>

      <Gruppe name="Bundesland" zaehler={filter.bundeslaender.length} offenAnfangs>
        <div className="wahl">
          {bundeslaender.map((name) => {
            const ohneAbgang = laenderOhneAbgang.includes(name);
            return (
              <Wahlknopf
                key={name}
                name={name}
                anzahl={anzahlJeBundesland.get(name) ?? 0}
                marke={ohneAbgang}
                {...(ohneAbgang
                  ? {
                      titel:
                        `Aus ${name} ist über Immowelt bisher kein einziger Abgang erkannt ` +
                        `worden. Dass ein Objekt hier nicht als abgängig markiert ist, belegt ` +
                        `nicht, dass es noch da ist.`,
                    }
                  : {})}
                gewaehlt={filter.bundeslaender.includes(name)}
                umschalten={() =>
                  aendere({ bundeslaender: schalteAuswahl(filter.bundeslaender, name) })
                }
              />
            );
          })}
        </div>
        {/*
          Der Klartext, den Entwurf 6.3 ausdruecklich am Regionsfilter
          verlangt. Die Laender kommen aus `laenderOhneAbgangserkennung` und
          damit AUS DEN DATEN -- eine feste Liste ["nw","bw","mv"] waere schon
          beim Schreiben veraltet gewesen, weil `sh` seit dem 2026-09-15 die
          vierte ist und in keiner Spezifikation steht.
        */}
        {laenderOhneAbgang.length > 0 && (
          <p className="regionsnotiz">
            <b>
              {laenderOhneAbgang.length === 1
                ? "Aus einem Land"
                : `Aus ${laenderOhneAbgang.length} Ländern`}{" "}
              ist über Immowelt bisher kein einziger Abgang erkannt worden
            </b>{" "}
            ({laenderOhneAbgang.join(", ")}) — sie sind oben gestrichelt markiert. Diese Regionen
            weisen ihre Trefferzahl nicht aus, und ohne die kann kein Sweep als vollständig
            gelten. Dass ein Objekt dort nicht als abgängig markiert ist, ist{" "}
            <b>kein Beleg dafür, dass es noch da ist</b>.
          </p>
        )}
        <p className="regionsnotiz" style={{ borderLeftStyle: "dashed" }}>
          Insgesamt stehen <b>{formatiereAnzahl(zustaendeGesamt.unbestaetigt)}</b> von{" "}
          {formatiereAnzahl(zustaendeGesamt.gesamt)} Objekten (
          {formatiereProzent(
            zustaendeGesamt.gesamt === 0
              ? null
              : zustaendeGesamt.unbestaetigt / zustaendeGesamt.gesamt,
            1
          )}
          ) als „unbestätigt“: Dort hat zuletzt niemand hingesehen. Das ist etwas anderes als
          „abgängig“ und wird deshalb auch anders gezeichnet.
        </p>
      </Gruppe>

      <Gruppe name="Trefferlage" zaehler={
        (filter.nurUeberMeldeschwelle ? 1 : 0) +
        (filter.nurPreissenkungen ? 1 : 0) +
        (filter.nurSchwellenwechsler ? 1 : 0)
      } offenAnfangs>
        <label className="schalter">
          <input
            type="checkbox"
            checked={filter.nurUeberMeldeschwelle}
            onChange={(e) => aendere({ nurUeberMeldeschwelle: e.currentTarget.checked })}
          />
          <span>
            Nur über der Meldeschwelle
            <em>hält DSCR 1,30 auch an der unteren Bandkante</em>
          </span>
        </label>
        <label className="schalter">
          <input
            type="checkbox"
            checked={filter.nurPreissenkungen}
            onChange={(e) => aendere({ nurPreissenkungen: e.currentTarget.checked })}
          />
          <span>
            Nur Preissenkungen
            <em>price_dropped an der jüngsten Version</em>
          </span>
        </label>
        <label className="schalter">
          <input
            type="checkbox"
            checked={filter.nurSchwellenwechsler}
            onChange={(e) => aendere({ nurSchwellenwechsler: e.currentTarget.checked })}
          />
          <span>
            Nur Schwellenwechsler
            <em>das Band überquert die Schwelle — der Rang hängt an der Schätzung</em>
          </span>
        </label>
      </Gruppe>

      <Gruppe name="Sicherheitsstufe" zaehler={filter.stufen.length}>
        <div className="wahl">
          {STUFEN.map((stufe) => (
            <Wahlknopf
              key={stufe.wert}
              name={stufe.name}
              titel={stufe.titel}
              anzahl={anzahlJeStufe.get(stufe.wert) ?? 0}
              gewaehlt={filter.stufen.includes(stufe.wert)}
              umschalten={() => aendere({ stufen: schalteAuswahl(filter.stufen, stufe.wert) })}
            />
          ))}
        </div>
      </Gruppe>

      <Gruppe name="Zustand" zaehler={filter.zustaende.length}>
        <div className="wahl">
          {ZUSTAENDE.map((zustand) => (
            <Wahlknopf
              key={zustand.wert}
              name={zustand.name}
              titel={zustand.titel}
              anzahl={anzahlJeZustand.get(zustand.wert) ?? 0}
              gewaehlt={filter.zustaende.includes(zustand.wert)}
              umschalten={() =>
                aendere({ zustaende: schalteAuswahl(filter.zustaende, zustand.wert) })
              }
            />
          ))}
        </div>
      </Gruppe>

      <Gruppe name="Quelle" zaehler={filter.quellen.length}>
        <div className="wahl">
          {QUELLEN.map((quelle) => (
            <Wahlknopf
              key={quelle.wert}
              name={quelle.name}
              anzahl={anzahlJeQuelle.get(quelle.wert) ?? 0}
              gewaehlt={filter.quellen.includes(quelle.wert)}
              umschalten={() => aendere({ quellen: schalteAuswahl(filter.quellen, quelle.wert) })}
            />
          ))}
        </div>
      </Gruppe>

      <Gruppe
        name="Preis und Maße"
        zaehler={
          [
            filter.kaufpreisVon,
            filter.kaufpreisBis,
            filter.wohnflaecheVon,
            filter.wohnflaecheBis,
            filter.grundstueckVon,
            filter.grundstueckBis,
          ].filter((wert) => wert !== null).length
        }
      >
        <Spannenfeld
          beschriftung="Kaufpreis"
          einheit="€"
          von={filter.kaufpreisVon}
          bis={filter.kaufpreisBis}
          ohneAngabe={ohneAngabe.kaufpreis}
          gesamt={gesamt}
          setze={(von, bis) => aendere({ kaufpreisVon: von, kaufpreisBis: bis })}
        />
        <Spannenfeld
          beschriftung="Wohnfläche"
          einheit="m²"
          von={filter.wohnflaecheVon}
          bis={filter.wohnflaecheBis}
          ohneAngabe={ohneAngabe.wohnflaeche}
          gesamt={gesamt}
          setze={(von, bis) => aendere({ wohnflaecheVon: von, wohnflaecheBis: bis })}
        />
        <Spannenfeld
          beschriftung="Grundstück"
          einheit="m²"
          von={filter.grundstueckVon}
          bis={filter.grundstueckBis}
          ohneAngabe={ohneAngabe.grundstueck}
          gesamt={gesamt}
          setze={(von, bis) => aendere({ grundstueckVon: von, grundstueckBis: bis })}
        />
      </Gruppe>

      <Gruppe
        name="Baujahr und Einheiten"
        zaehler={
          [filter.baujahrVon, filter.baujahrBis, filter.einheitenVon, filter.einheitenBis].filter(
            (wert) => wert !== null
          ).length
        }
      >
        <Spannenfeld
          beschriftung="Baujahr"
          einheit="Jahr"
          von={filter.baujahrVon}
          bis={filter.baujahrBis}
          ohneAngabe={ohneAngabe.baujahr}
          gesamt={gesamt}
          setze={(von, bis) => aendere({ baujahrVon: von, baujahrBis: bis })}
        />
        <Spannenfeld
          beschriftung="Einheiten"
          einheit="Anzahl"
          von={filter.einheitenVon}
          bis={filter.einheitenBis}
          ohneAngabe={ohneAngabe.einheiten}
          gesamt={gesamt}
          setze={(von, bis) => aendere({ einheitenVon: von, einheitenBis: bis })}
        />
        <p className="spanne__preis">
          Wo eine Einheitenzahl steht, ist sie meist <b>angenommen</b> und nicht bestätigt; das
          Objekt trägt die Marke dann selbst. Bestätigte Zahlen sind die Ausnahme.
        </p>
      </Gruppe>

      <Gruppe name="Datenlücke" zaehler={filter.datenluecken.length}>
        <div className="wahl">
          {datenluecken.map((luecke) => (
            <Wahlknopf
              key={luecke.text}
              name={luecke.text}
              anzahl={luecke.anzahl}
              gewaehlt={filter.datenluecken.includes(luecke.text)}
              umschalten={() =>
                aendere({ datenluecken: schalteAuswahl(filter.datenluecken, luecke.text) })
              }
            />
          ))}
        </div>
      </Gruppe>

      <Gruppe
        name="Zwangsversteigerung"
        zaehler={
          (filter.terminNur ? 1 : 0) +
          (filter.terminVon !== null ? 1 : 0) +
          (filter.terminBis !== null ? 1 : 0)
        }
      >
        <label className="schalter">
          <input
            type="checkbox"
            checked={filter.terminNur}
            onChange={(e) => aendere({ terminNur: e.currentTarget.checked })}
          />
          <span>
            Nur mit Termin
            <em>auction_at gesetzt — gibt es nur bei ZVG-Objekten</em>
          </span>
        </label>
        <div className="spanne">
          <span className="spanne__beschriftung">
            <span>Termin</span>
          </span>
          <div className="spanne__felder">
            <input
              type="date"
              aria-label="Termin von"
              value={filter.terminVon ?? ""}
              onChange={(e) =>
                aendere({ terminVon: e.currentTarget.value === "" ? null : e.currentTarget.value })
              }
            />
            <span className="spanne__bis">bis</span>
            <input
              type="date"
              aria-label="Termin bis"
              value={filter.terminBis ?? ""}
              onChange={(e) =>
                aendere({ terminBis: e.currentTarget.value === "" ? null : e.currentTarget.value })
              }
            />
          </div>
        </div>
      </Gruppe>
    </div>
  );
}
