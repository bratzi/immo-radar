# Entwurf — Die Karte als Dreh- und Angelpunkt der Weboberfläche

> Nutzerauftrag, 2026-09-19, per `superpowers:brainstorming` erarbeitet und
> Punkt für Punkt bestätigt (Chat-Verlauf dieser Sitzung). Architektonisch
> eingestuft: mehrere gekoppelte Komponenten, neue Hover-Verdrahtung
> zwischen Tabelle und Karte, Layout-Umbau, Kollision mit einer bewusst
> gesetzten Invariante (siehe unten). Nächster Schritt nach diesem Dokument:
> `superpowers:writing-plans`, nicht direkte Umsetzung.

## Die Datengrenze, die jede Entscheidung hier prägt

`web/src/logik/karte.ts` (`buendlePlzPunkte`) bündelt die Punktschicht der
Karte **bewusst** nach PLZ-Zweisteller, nicht je Objekt:

> „40 Punkte übereinander zu zeichnen behauptete 40 Orte, wo es nur einen
> gibt."

Ein Punkt ist der gemeinsame Mittelpunkt eines ganzen PLZ-Zweistellerbereichs
(z. B. „80…" = Großraum München), geteilt von allen Objekten darin — **keine
Einzeladresse**. Nur **1,3 %** aller Objekte tragen überhaupt eine PLZ, aus
der sich so ein Bereich ableiten lässt (`Abdeckung.mitPlz` in `karte.ts`);
der Rest hat höchstens sein Bundesland, ein kleiner Teil (54 Objekte, Stand
09-15) nicht einmal das.

**Entscheidung des Nutzers (2026-09-19): ehrlich bleiben.** Kein Objekt wird
als „hier genau" markiert, wenn die Daten das nicht hergeben. Stattdessen:

- Objekt mit PLZ → markiert den vorhandenen PLZ-Zweisteller-Punkt.
- Objekt ohne PLZ, aber mit Bundesland → markiert die Bundesland-Kachel.
- Objekt ganz ohne Ortsangabe → keine Markierung auf der Karte. Die Zeile
  selbst darf das sagen (z. B. ein kleines Symbol/Hinweistext), aber das ist
  kein neuer Zustand — `bundesland === null` gibt es in `SnapshotObjekt`
  bereits.

## Die zweite Invariante, die dieser Entwurf NICHT anfasst

`Karte.tsx` zeigt **immer den ganzen Bestand**, nie die gefilterte Auswahl —
ausdrücklich begründet: Ein früherer Entwurf ließ die Punktschicht dem
Filter folgen und die Flächenfärbung nicht, das erzeugte zwei widersprüchliche
Zahlen unter einer Legende. **Das Hover-Highlight aus diesem Entwurf ist
keine Filteränderung** — die Grundschicht (Kacheln, Punkte, ihre Farbe/Größe)
bleibt exakt wie heute berechnet. Nur ein zusätzliches, transientes
Hervorhebungs-Overlay kommt dazu, das beim Verlassen des Hovers wieder
verschwindet. Ein Klick auf einen Punkt darf dagegen filtern (siehe unten) —
das ist keine neue Regel, Bundesland-Kacheln tun das heute schon.

## Was gebaut wird

### 1. Hover-Verdrahtung Tabelle → Karte

- Neuer State in `Dashboard` (`App.tsx`): `hoverObjektId: string | null`.
- `Objektzeile.tsx` bekommt `onHoverStart`/`onHoverEnd`-Props (oder eine
  einzelne `onHover: (id: string | null) => void`), ausgelöst über
  `onMouseEnter`/`onMouseLeave` auf dem Wurzelelement. **Performance
  beachten** (`react-best-practices`-Skill anwenden, Kategorie
  `rerender-*`): Die Zeile ist `memo`isiert und wird über eine virtualisierte
  Liste bis zu 18.000-fach potenziell gerendert — der Hover-Handler muss
  eine über `useCallback`/Closure stabile Funktion sein, damit ein Hover
  nicht das Memoisieren der ganzen sichtbaren Fensterliste zunichtemacht.
- `Karte.tsx` bekommt eine neue Prop `hervorgehobenesObjekt: SnapshotObjekt | null`
  (das Objekt selbst, nicht nur die ID — `Dashboard` löst die ID gegen
  `alleObjekte` auf, `Karte` selbst kennt keine Objektliste außerhalb dessen,
  was sie schon bekommt).
- Ableitung in `Karte.tsx`: `zweistellerMitKoordinate(objekt.plz)` (bereits
  exportiert aus `karte.ts`) → wenn nicht `null`, den passenden Punkt in
  `punkte` hervorheben; sonst `objekt.bundesland` → die passende Kachel in
  `lagen` hervorheben; sonst nichts.

### 2. Sofortiges, gestyltes Tooltip

Ersetzt das native `<title>` (verzögert, unformatiert) für **beide**
Schichten (Kacheln und Punkte) durch ein eigenes Tooltip-Element:

- Eigene Komponente, z. B. `KartenTooltip.tsx`: positioniert sich absolut
  über der Karte, folgt der Maus oder ankert an der gehoverten Form,
  erscheint ohne Verzögerung.
- Inhalt bleibt, was `beschriftungFuer`/der Punkt-Titel heute schon
  berechnen (Name, Objekte, Top-Treffer, Median-DSCR, Standalter bzw.
  PLZ + Anzahl) — nur die Darstellung ändert sich, nicht die Datenherleitung.
- `<title>`-Elemente können bleiben (Zugänglichkeit für Tastatur/Screenreader,
  die kein Maus-Tooltip auslösen), das neue Tooltip kommt zusätzlich für den
  Maus-Hover-Fall.

### 3. Klick auf einen PLZ-Punkt filtert

- `Filter` (`logik/filter.ts`) bekommt ein neues Feld `plzZweisteller: string[]`
  (gleiches Muster wie `bundeslaender: string[]`), `LEERER_FILTER` entsprechend
  ergänzt.
- `wendeFilterAn` bekommt eine Zeile analog zu den bestehenden
  `inAuswahl`-Prüfungen: `inAuswahl(zweistellerMitKoordinate(objekt.plz), filter.plzZweisteller)`.
- `Karte.tsx` bekommt `schaltePlz: (zweisteller: string) => void`, analog zu
  `schalteLand`, am `<circle>`-Element der Punktschicht (heute nicht
  klickbar, nur mit `<title>`).
- **Offene Detailfrage für den Plan, keine Grundsatzfrage:** Wie zeigt die
  Filterleiste (`Filterleiste.tsx`) einen aktiven PLZ-Filter an? Vermutlich
  ein Chip/Badge analog zu den Bundesland-Chips — im Plan konkretisieren.

### 4. Layout: Karte als eigene, dauerhaft sichtbare Spalte

**Gewählter Weg (Weg B, bestätigt):** Die Karte verlässt die heutige
`.tafeln`-Zeile (die sie sich mit der Betriebstafel teilt) und wird eine
eigene, `position: sticky` Spalte **zwischen** `.rail` (Filterleiste, schon
`sticky`) und dem scrollenden Inhalt — dasselbe CSS-Muster wie `.rail`
(`web/src/stil.css:168`), nur eine zusätzliche Grid-Spalte in `.geruest`
(`stil.css:145`).

- **Die Betriebstafel wandert an den Anfang des scrollenden Inhalts**,
  oberhalb von „Top-Treffer" — bestätigt vom Nutzer. Sie ist Betriebsstatus,
  kein Dauerblick-Element.
- Mobile/schmale Breite: Die bestehende Media Query (`stil.css` ab Zeile
  ~1486) faltet `.rail` und `.tafeln` heute schon in eine Spalte. Die neue
  Kartenspalte muss dort ebenfalls zurück in den normalen Fluss fallen
  (nicht sticky auf schmalen Bildschirmen) — sonst nimmt sie auf einem
  Handy-Bildschirm dauerhaft die halbe Höhe weg. Konkrete Breakpoint-Regel
  im Plan festlegen.
- **`web-design-guidelines`-Skill beim Umsetzen anwenden** (Layout, Kontrast,
  Tastaturbedienbarkeit der neuen Sticky-Spalte).

## Nicht-Ziele dieses Entwurfs

- **Keine echte Geokodierung.** Weg 2 aus dem Brainstorming (echte
  Koordinate je Objekt) ist explizit abgelehnt — eigenes, viel größeres
  Projekt, hier nicht Teil.
- **Keine Änderung an der Grundschicht-Berechnung** (Flächenfärbung,
  PLZ-Bündelung) — nur ein zusätzliches Hervorhebungs-Overlay.
- **Keine neue Datenquelle, kein neuer Snapshot-Export-Schritt.** Alles
  Nötige (`plz`, `bundesland`) steht in `SnapshotObjekt` bereits.

## Für die Umsetzung (nächste Sitzung)

1. `superpowers:writing-plans` auf Basis dieses Dokuments.
2. Bei jedem Teilschritt, der die Weboberfläche betrifft: die neu
   installierten Skills **`web-design-guidelines`** und
   **`react-best-practices`** anwenden (Nutzerauftrag 2026-09-19) — nicht
   nur für dieses Feature, sondern als Standardpraxis für künftige
   Web-Arbeit an `web/`.
3. TDD wie im ganzen Projekt: `logik/filter.ts` (neues Feld, neue
   Filterzeile) und `logik/karte.ts` (Ableitung „welcher Punkt/welche
   Kachel gehört zu diesem Objekt") sind reine Funktionen — dort zuerst der
   rote Test, dann die minimale Umsetzung. Die React-Verdrahtung
   (Hover-State, Tooltip-Positionierung) ist der Teil, der sich am ehesten
   nur im Browser wirklich prüfen lässt (`run`-Skill).
