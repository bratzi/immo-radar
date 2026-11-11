# B13 — Immowelt-Abgänge wirklich löschen: Markierung und Löschhoheit trennen

**Entwurf vom 2026-09-22.** Grundlage: `docs/superpowers/BACKLOG.md`, Abschnitt B13,
und die dort festgehaltene Entscheidung des Nutzers vom selben Tag.

## Das Problem

Abgängige Immowelt-Objekte werden markiert, aber nie gelöscht. Gemessen am
2026-09-22 gegen die Live-Datenbank: 23.333 Immowelt-Zeilen, davon 1.455
abgängig markiert. Keine davon verschwindet je. Bei ZVG (188 Zeilen, 5
markiert) passiert das Richtige, weil `zvg-portal` als einzige Quelle in
`QUELLEN_MIT_LOESCHHOHEIT` steht.

### Die Falle, die vor jeder Umsetzung steht

Der naheliegende Griff — „immowelt" in `QUELLEN_MIT_LOESCHHOHEIT`
(`scraper/lib/bestandDb.ts:238`) eintragen — bewirkt das Gegenteil des Ziels.
`ermittleMarkierungen` (`scraper/lib/bestand.ts:246`) verzweigt heute an einem
einzigen Schalter:

```ts
if (befugnis.hatLoeschhoheit) {
  if (!befugnis.quellenPruefungBestanden) return [];   // <- hier landet Immowelt
  return ermittleAbgaenge(sweep, bekannte);
}
return nichtMehrGesehen(sweep, bekannte);              // <- der heutige Immowelt-Weg
```

`quellenPruefungBestanden` stammt aus `pruefeMengenplausibilitaet`
(`scraper/lib/plausibilitaet.ts:56`) und ist für Immowelt dauerhaft `false`,
weil `vollstaendig` im Immowelt-Scraper fest auf `false` steht
(`scraper/scrapers/immowelt/index.ts`, Zeilen 738 und 778). Der Eintrag
schickte die Funktion also in `return []`. Nach einer einmaligen Löschwelle
der heute markierten 1.455 Objekte wäre die Abgangserkennung für Immowelt
dauerhaft tot.

Der Schalter trägt zwei Fragen, die nichts miteinander zu tun haben:

1. **Darf ich markieren, und woran erkenne ich einen Abgang?** Immowelt braucht
   dafür den Regionsnachweis: nicht gesehen in einer Region, die dieser Lauf
   vollständig erfasst hat. Dieser Nachweis ist die Wache und bleibt
   unverändert.
2. **Darf eine bereits markierte Zeile nach Ablauf der Karenz verschwinden?**
   Das ist die neue Freigabe. Sie hängt an der Markierung, die der
   Regionsnachweis bereits gedeckt hat, nicht an einem zweiten Mengenurteil.

## Entscheidungen des Nutzers, die diesem Entwurf zugrunde liegen

| Frage | Entscheidung |
|---|---|
| Altbestand von 1.455 Markierungen | Karenz zählt neu ab einem Stichtag. Fälligkeit = `max(disappeared_at, stichtag) + karenzTage`. |
| Löschmenge je Lauf | Deckel von 200 Zeilen je Lauf, älteste zuerst. |
| Karenz für Immowelt | 14 Tage. ZVG bleibt bei 2. |
| Dashboard | Karenz je Quelle auch in der Anzeige. Anzeige und Löschung bleiben dieselbe Wahrheit. |

## Verworfene Ansätze

**Löschhoheit bleibt ein Schalter, und `quellenPruefungBestanden` wird für
Immowelt wahr gemacht.** Weniger Codeänderung, aber das hieße,
`pruefeMengenplausibilitaet` für eine rotierend erfasste Quelle zu übergehen.
Die Wache würde nicht zerlegt, sondern abgeschaltet.

**Löschung als eigener Aufräumlauf außerhalb der Sweep-Logik.** `bestand.ts`
bliebe unberührt, aber es entstünde eine zweite Löschstelle neben
`loescheAbgelaufene`, mit einer eigenen Kopie der drei Bedingungen. Genau die
Bauart, aus der die bisherigen Fail-open-Stellen entstanden sind.

## 1. Regelwerk und Befugnis

Eine neue Datei `scraper/lib/quellenregeln.ts` hält die einzige Wahrheit über
das Verhalten je Quelle:

```ts
export interface Quellenregel {
  /** Traegt eine Markierung hier die Beweislast der Loeschung? */
  markierungTraegtLoeschbeweis: boolean;
  darfHartLoeschen: boolean;
  karenzTage: number;
}

const REGELN: Record<string, Quellenregel> = {
  "zvg-portal": { markierungTraegtLoeschbeweis: true,  darfHartLoeschen: true, karenzTage: 2 },
  "immowelt":   { markierungTraegtLoeschbeweis: false, darfHartLoeschen: true, karenzTage: 14 },
};

export function regelFuer(source: string): Quellenregel;
export function quellenMitLoeschrecht(): string[];
export const LOESCHUNG_AKTIV_AB: Date;
export const LOESCHUNG_JE_LAUF: number;
```

Eine unbekannte Quelle erhält fail-closed
`{ markierungTraegtLoeschbeweis: false, darfHartLoeschen: false, karenzTage: KARENZ_MAX }`
— nicht als Löschvorstufe markieren, nicht löschen, längste Karenz. Ein
unbekannter Zustand ist nie „in Ordnung".

`KARENZ_MAX` ist der größte `karenzTage`-Wert aus `REGELN`, zur Ladezeit
daraus berechnet statt getrennt gepflegt. Kommt später eine Quelle mit
längerer Karenz hinzu, wandert der Vorgabewert automatisch mit. Für die
Löschung ist er ohne Wirkung, weil `darfHartLoeschen: false` bereits sperrt;
er wirkt allein dort, wo eine Karenz angezeigt oder gerechnet wird.

Warum eine Tabelle und nicht drei Listen: zwei Verzeichnisse, die
auseinanderlaufen können, sind genau das, wovor der Kommentar in
`bestandDb.ts:250` warnt. Alle drei Antworten kommen aus derselben Zeile.

**Änderungen an bestehendem Code:**

- `Markierbefugnis` (`bestand.ts:198`) wird zu
  `{ markierungTraegtLoeschbeweis: boolean; quellenPruefungBestanden: boolean }`.
  Das Feld `hatLoeschhoheit` entfällt.
- `ermittleMarkierungen` verzweigt an `markierungTraegtLoeschbeweis` statt an
  der Löschhoheit. Für ZVG ändert sich dadurch nichts; für Immowelt bleibt der
  Weg über `nichtMehrGesehen`, also der Regionsnachweis. Das ist die Stelle,
  an der der naive Eintrag die Abgangserkennung getötet hätte.
- `main.ts:417` (`if (befugnis.hatLoeschhoheit) return;`) verwendet ebenfalls
  `markierungTraegtLoeschbeweis`. Das ist dort die inhaltlich richtige Frage:
  abgebrochen wird, weil die Markierung eine gerade untersagte Löschung
  beginnen würde — nicht, weil die Quelle irgendwann löschen darf.
- `quelleHatLoeschhoheit` (`bestandDb.ts:255`) wird zu
  `quelleDarfHartLoeschen` und liest aus `REGELN`. Die Konstante
  `QUELLEN_MIT_LOESCHHOHEIT` entfällt zugunsten von `quellenMitLoeschrecht()`.

## 2. Löschpfad: Karenz je Quelle, Stichtag, Deckel

`istHartLoeschbar` (`bestand.ts:290`) nimmt Karenz und Stichtag als Argumente
statt aus einer Modulkonstante:

```ts
export function istHartLoeschbar(
  disappearedAt: string,
  lastSeen: string | null,
  jetzt: Date,
  karenzTage: number,
  stichtag: Date
): boolean
```

Fälligkeit ist `max(disappeared_at, stichtag) + karenzTage`. Die zweite,
unabhängige Bedingung — `last_seen` muss ebenfalls älter als die Karenz sein —
bleibt bestehen und verwendet dieselbe Quellkarenz.

Alle Fail-closed-Regeln bleiben wörtlich erhalten und werden um eine ergänzt:

- fehlendes oder unlesbares `last_seen`: keine Löschung,
- unlesbares `disappeared_at`: keine Löschung,
- `karenzTage`, das nicht endlich ist: keine Löschung (neu).

**Stichtag.** `LOESCHUNG_AKTIV_AB = new Date("2026-10-06T00:00:00Z")`,
dokumentiert als Umstellungstag für B13. Er kommt als Argument in die
Funktion, damit Tests ihn setzen können — dieselbe Bauform wie `jetzt`. Wirkung:
die heute markierten 1.455 Objekte bekommen ab der Umstellung volle 14 Tage,
in denen `ermittleRueckkehrer` sie zurückholen kann. Eine Markierung aus einer
Zeit vor dem heutigen Regionsnachweis wird damit nicht ungeprüft vollstreckt.

**`loescheAbgelaufene` (`bestandDb.ts:270`):**

- Der `.in("source", …)`-Filter liest die Quellen aus `quellenMitLoeschrecht()`.
- Die Abfrage liest `source` mit, damit je Zeile die richtige Karenz gilt.
- Sortierung nach `disappeared_at` aufsteigend, damit der Deckel die ältesten
  zuerst nimmt.
- Nach dem Filtern durch `istHartLoeschbar` wird auf `LOESCHUNG_JE_LAUF = 200`
  gekürzt. Der Deckel greift **nach** der Prüfung, nie an ihrer Stelle.
- Rückgabewert bleibt die Zahl gelöschter Zeilen. `main.ts:833` bleibt
  unverändert.

Bei etwa acht Läufen am Tag ist ein Berg von 1.455 Zeilen in unter einem Tag
abgeräumt, während ein Logikfehler je Lauf höchstens 200 Zeilen trifft. Die
Kaskade auf `listing_versions` und `notifications` bleibt unverändert; bei 200
Zeilen je Lauf ist sie kein Sonderfall mehr.

Die bisherige Konstante `KARENZ_TAGE` (`bestand.ts:4`) entfällt als globaler
Wert. Ihre Rolle übernimmt `regelFuer(source).karenzTage`.

## 3. Snapshot-Vertrag und Dashboard

`snapshot.konstanten.karenzTage: number` wird zu
`karenzTageJeQuelle: Record<string, number>`, geschrieben in
`scraper/lib/snapshot.ts:589` aus `REGELN`. Ein einzelner Skalar bleibt nicht
daneben stehen: zwei Quellen für dieselbe Zahl sind die Bauart, die dieser
Entwurf gerade abschafft.

Mitzuziehen sind `web/src/daten/snapshot.ts:107` (Typ), die Wache an der
Dateigrenze in `web/src/daten/laden.ts`, `web/src/daten/snapshot.vertrag.test.ts:60`
sowie `web/src/App.tsx` (Zeilen 152, 157, 216).

`bestimmeBereich(objekt, jetzt, karenzTageJeQuelle)` schlägt über
`objekt.quelle` (`web/src/daten/snapshot.ts:39`) nach.

**Die Fail-closed-Richtung ist im Dashboard bewusst die umgekehrte.** Fehlt
die Quelle in der Zuordnung oder ist der Wert nicht endlich, gilt weiterhin
„Karenz vorbei", und das Objekt verlässt die Rangliste. Das ist die Richtung,
die `karenzVorbei` (`web/src/logik/gliederung.ts:44`) heute schon hat, und sie
ist richtig, weil ein Anzeigefehler nichts zerstört: die Alternative wäre ein
Objekt, das die Rangliste nie verlässt. Im Scraper bedeutet „unbekannt"
dagegen „längste Karenz, nicht löschen", weil dort ein Fehlurteil Daten
vernichtet. Beide Richtungen schützen dasselbe Gut: niemand verliert etwas.

Die bestehenden Wachen in `web/src/logik/gliederung.test.ts` (Zeilen 92 und
103) bleiben sinngemäß erhalten und werden auf die Zuordnung umgeschrieben.

## 4. Tests, in dieser Reihenfolge, jeder zuerst rot

1. **Immowelt markiert weiterhin.** Sweep mit `vollstaendig: false`,
   `quellenPruefungBestanden: false`, Geltungsbereich eine Region. Erwartung:
   `ermittleMarkierungen` liefert die nicht mehr gesehenen Objekte dieser
   Region, nicht `[]`. Dieser Test ist der Zaun um die Regression, die der
   naive Eintrag ausgelöst hätte.
2. **Sabotageprobe A:** `markierungTraegtLoeschbeweis` für Immowelt probeweise
   auf `true` setzen. Test 1 muss rot werden. Andernfalls beweist er nichts.
3. **ZVG unverändert.** Die bestehenden Fälle in `bestand.test.ts:491ff.`
   laufen weiter, nur mit dem neuen Feldnamen.
4. **Sabotageprobe B:** den Regionsnachweis (`geltungsbereich`) probeweise
   ignorieren. Die Suite muss rot werden. Wird sie es nicht, fehlt ein Test.
5. **Karenz je Quelle.** Gleiches `disappeared_at`: Immowelt nach 13 Tagen
   nicht löschbar, nach 15 löschbar; ZVG nach 3 Tagen löschbar.
6. **Stichtag.** Ein Objekt mit `disappeared_at` 40 Tage vor dem Stichtag ist
   am Stichtag nicht löschbar, 15 Tage danach schon.
7. **Unbekannte Quelle löscht nie** — weder über `regelFuer` noch über den
   `.in(source)`-Filter der Abfrage.
8. **Deckel.** 500 fällige Zeilen: ein Lauf löscht 200, und zwar die 200
   ältesten.
9. **Deckel greift nach der Prüfung.** 500 Zeilen, davon 300 mit
   `last_seen: null`: gelöscht werden nur die fälligen. Der Deckel wird nie
   mit Zeilen aufgefüllt, die die Prüfung nicht bestanden haben.
10. **Dashboard.** Ein Immowelt-Objekt ist nach 3 Tagen noch in der Rangliste,
    ein ZVG-Objekt nach 3 Tagen unter „Abgänge", eine unbekannte Quelle unter
    „Abgänge".

Kein Test schreibt gegen die Live-Datenbank. Gemessen wird gegen Attrappen,
wie `bestandDb.test.ts` es heute tut.

## Abnahme

- `scraper`-Suite grün (Ausgangsstand 610 Tests).
- Web-Suite grün mit verlinkter Snapshot-Datei: 211 bestanden / 1
  übersprungen, nicht 202 / 10. Der zweite Stand sieht grün aus und
  überspringt dabei still zehn Vertragsfälle.
- `tsc --noEmit` sauber in `scraper` und `web`.
- Beide Sabotageproben sind ausgeführt und ihr Rotwerden ist belegt.

## Verhältnis zu B1

B1 will regionsgenaues Löschen über die Mengenplausibilität je Partition. B13
braucht das nicht: die Markierung trägt den Ortsbezug bereits. B13 ist der
kleinere, näher liegende Schritt. B1 bleibt davon unberührt offen.
