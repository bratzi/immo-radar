# Der Filterzustand gehört in die URL (B7-1)

**Stand:** 2026-09-22
**Herkunft:** BACKLOG B7-1, aufgenommen beim Oberflächen-Audit (Task 10 des
Kartenplans, 2026-09-20)
**Entscheidungen des Nutzers:** 2026-09-22, in diesem Vorgang (Abschnitt 2)

## 1. Was heute falsch ist

Bundesländer, PLZ-Bereiche, Stufen, Spannen und die Kartengröße leben
ausschließlich in `useState` (`web/src/App.tsx:121` und `:122`). Drei
Folgen, alle drei am Bestand nachvollziehbar:

- Eine Auswahl lässt sich **niemandem schicken**. Es gibt keine Adresse dafür.
- Ein **Neuladen wirft sie weg** — auch das versehentliche.
- Der **Zurück-Knopf verlässt die Seite**, statt den Filter zu lösen.

Der Filter hat **22 Felder** (`Filter` in `web/src/logik/filter.ts:44`).
Daneben stehen zwei reine Ansichtszustände: `kartengroesse`
(`"objekte" | "topTreffer" | "medianDscr"`) und `offen` (welche Bereiche
aufgeklappt sind).

## 2. Die drei Entscheidungen

Der Backlog nennt drei Fragen. Sie sind beantwortet:

| Frage | Entscheidung | Von wem |
|---|---|---|
| Welche Felder gehören in die URL? | Die 22 Filterfelder **und** `kartengroesse`. `offen` **nicht**. | Nutzer, 2026-09-22 |
| Wie kurz darf sie bleiben? | Kurz durch **Weglassen** der Standardwerte, nicht durch Kürzel-Tabellen. | Entwurf, Abschnitt 4 |
| Was ist ein Schritt des Zurück-Knopfes? | Jede abgeschlossene Eingabe. Nur die zwei Datumsfelder ersetzen (korrigiert 2026-09-22, Abschnitt 5). | Nutzer, 2026-09-22 |
| Was bei einer URL, die nichts trifft? | Auswahl **bleibt stehen**, Liste leer, Grund im Klartext, Knopf zum Lösen. | Entwurf, Abschnitt 6 |

**Warum `offen` draußen bleibt:** Aufgeklappte Bereiche sind Bedienzustand,
keine Auswahl. Sie blähen die URL auf und sagen nichts darüber, was jemand
sehen wollte.

## 3. Der Ansatz: die URL ist die Quelle, nicht ein Spiegel

Der Filter wird aus `location.search` **abgeleitet**, statt in `useState`
gehalten und nebenher gespiegelt zu werden.

**Warum nicht spiegeln.** Ein Spiegel sind zwei Stände desselben Wertes, und
zwei Stände laufen auseinander. Genau dieser Fehler steht in diesem Projekt
schon in der Historie: `DSCR_MELDESCHWELLE` lag als Zahl an zwei Stellen und
wäre bei einer Änderung an einer davon lautlos gebrochen (A17, behoben in
`6f2ce67`). Ein Filter, der in `useState` und in der URL steht, hat dieselbe
Bauart — und zusätzlich die Schleifengefahr zwischen Effekt und Ereignis.

**Technisch:** `useSyncExternalStore`, abonniert auf `popstate`, Momentaufnahme
ist `location.search`. React-18-Bordmittel. **Kein neues Paket** — `web/`
hängt heute an genau zwei Laufzeitabhängigkeiten (`react`, `react-dom`), und
das bleibt so.

## 4. Das Format

Geschrieben wird **nur, was vom `LEERER_FILTER` abweicht**. Ohne Auswahl
bleibt die Adresse vollständig sauber, ohne `?`.

```
?bl=Sachsen,ohne-region&st=S2,S3&kpb=150000&karte=medianDscr
```

| Schlüssel | Feld | Form |
|---|---|---|
| `bl` | `bundeslaender` | Liste, Komma |
| `plz` | `plzZweisteller` | Liste, Komma |
| `q` | `quellen` | Liste, Komma |
| `st` | `stufen` | Liste, Komma |
| `zu` | `zustaende` | Liste, Komma |
| `dl` | `datenluecken` | Liste, Komma |
| `kpv` / `kpb` | `kaufpreisVon` / `kaufpreisBis` | Zahl |
| `wfv` / `wfb` | `wohnflaecheVon` / `wohnflaecheBis` | Zahl |
| `gsv` / `gsb` | `grundstueckVon` / `grundstueckBis` | Zahl |
| `bjv` / `bjb` | `baujahrVon` / `baujahrBis` | Zahl |
| `ehv` / `ehb` | `einheitenVon` / `einheitenBis` | Zahl |
| `meld` | `nurUeberMeldeschwelle` | nur `1`, wenn wahr |
| `senk` | `nurPreissenkungen` | nur `1`, wenn wahr |
| `wech` | `nurSchwellenwechsler` | nur `1`, wenn wahr |
| `tn` | `terminNur` | nur `1`, wenn wahr |
| `tv` / `tb` | `terminVon` / `terminBis` | Datum |
| `karte` | `kartengroesse` | nur, wenn nicht `objekte` |

**Bundeslandnamen bleiben ausgeschrieben.** Eine Kürzel-Tabelle
(`nw`, `bw`, …) wäre eine **zweite Kopie** der Ländernamen neben
`BUNDESLAND_JE_REGIONSCODE` im Scraper und `plzBundesland.generated.json` —
eine Kopie, die stillschweigend veralten kann. Die Kürze kommt aus dem
Weglassen, nicht aus einer Tabelle, die gepflegt werden muss.

**`ohne-region`** ist bereits der Wert der Kategorie aus E-7
(`OHNE_REGION` in `filter.ts:42`) und kollidiert mit keinem Ländernamen. Er
wird unverändert übernommen.

## 5. Der Zurück-Knopf

**Jede abgeschlossene Eingabe schiebt einen Eintrag. Nur die beiden
Datumsfelder ersetzen ihn.**

**Korrigiert am 2026-09-22, nachdem der Code nachgesehen wurde.** Der erste
Entwurf begründete die Trennung damit, dass ein getipptes `150000` sechs
Verlaufseinträge erzeugte. **Das trifft nicht zu.** Die fünf Spannenfelder
(Kaufpreis, Wohnfläche, Grundstück, Baujahr, Einheiten) sind unkontrollierte
Eingabefelder und schreiben über **`onBlur`** (`Filterleiste.tsx:133`
und `:145`) — einmal je verlassenem Feld, nie je Tastendruck. Ein
abgeschlossenes Spannenfeld ist damit eine bewusste Einzelhandlung wie ein
Klick und gehört rückgängig gemacht.

Übrig bleiben **`terminVon` und `terminBis`** (`:553`, `:562`): Sie hängen an
`onChange` und feuern beim Tippen mehrfach. Nur sie ersetzen.

**Wo die Unterscheidung sitzt:** an der **einen** Änderungsfunktion
`aendere` (`Filterleiste.tsx:211`), nicht an 18 Aufrufstellen. Sie bekommt
einen zweiten Parameter mit dem Standard „Schritt"; genau **zwei** Aufrufe
übergeben „ersetzen".

**Was diese Korrektur zeigt:** Eine Begründung, die plausibel klingt, ist
keine gemessene. Der Unterschied stand die ganze Zeit im Code.

**Was das nicht hergibt:** Es ist keine Rückgängig-Funktion für die
Anwendung, sondern Browser-Verlauf. Wer die Seite verlässt und zurückkommt,
bekommt den Filter der Adresse, nicht eine Sitzungshistorie.

## 6. Eine URL, die nichts mehr trifft

Der Bestand wandert. Ein verschickter Link kann auf 0 Objekte filtern.

**Die Auswahl bleibt stehen.** Die Liste ist leer, und darüber steht im
Klartext, dass dieser Link auf 0 Objekte filtert, mit einem Knopf zum Lösen.

**Kein stilles Zurücksetzen und keine stille Bereinigung einzelner Werte.**
Ein PLZ-Zweisteller, der heute kein Objekt mehr trägt, wird **nicht** aus der
Auswahl entfernt — er steht weiter da, mit Zähler 0. Das ist dieselbe Regel,
nach der dieses Projekt auch sonst arbeitet: Ein leeres Ergebnis ist ein
Befund und wird benannt, nicht weggeräumt (`ABNAHME-BASIS.md` A-2).

## 7. Robustheit

`ausSuchstring` **wirft nie**. Die Adresse ist von Hand veränderbar, und eine
abgestürzte Oberfläche ist die schlechteste Antwort auf einen Tippfehler.

- Unbekannte Schlüssel werden **ignoriert**, nicht gemeldet.
- Ein unlesbarer Wert (`kpv=abc`) fällt auf den **Standard** zurück.
- Ein unbekannter Listeneintrag (`st=S9`) bleibt in der Auswahl stehen und
  trifft schlicht nichts — dieselbe Regel wie in Abschnitt 6.
- Ein unbekannter `karte`-Wert fällt auf `objekte` zurück.

## 8. Die Einheiten

| Einheit | Zweck | Hängt ab von |
|---|---|---|
| `web/src/logik/filterUrl.ts` | `zuSuchstring(filter, kartengroesse)` und `ausSuchstring(such)` — **rein, ohne DOM** | `filter.ts`, `karte.ts` (nur Typen) |
| `useFilterUrl` | verbindet Fenster und Zustand; **die einzige Stelle, die `history` anfasst** | `filterUrl.ts` |
| `App.tsx` | ersetzt zwei `useState` durch den Hook | `useFilterUrl` |
| `Filterleiste.tsx` | `aendere` bekommt den zweiten Parameter | — |
| `filter.ts` | `leergrund(gefiltert, gesamt, filterAktiv)` — **rein**: warum die Liste leer ist | — |

Die Trennung ist der Punkt: Das Format ist eine reine Funktion und damit ohne
Browser prüfbar. Der Hook enthält keine Formatlogik.

**Warum kein Komponententest.** `web/` hat heute **14 Testdateien, alle
reine Logik** (`.ts`) — keinen einzigen Komponententest, kein jsdom, keine
Testing-Library, und in `vite.config.ts` keinen `test`-Block. Ein
Komponententest wäre hier zwei neue Entwicklungsabhängigkeiten und ein neues
Muster, eingeführt nebenbei in einem Filter-Vorgang. Stattdessen wandert die
Entscheidung in eine reine Funktion (`leergrund`), und die Komponente wird
dünn: Sie wählt anhand des Ergebnisses den `leertext`. Das ist dasselbe
Vorgehen wie bei `laenderOhneAbgangserkennung`. Den vorhandenen
`leertext`-Mechanismus in `Bereich.tsx` gibt es bereits; er wird benutzt,
nicht ersetzt.

## 9. Der Beweis

**Zuerst rot, wie überall in diesem Projekt.**

1. **Hin- und Rückweg über einen Filter mit JEDEM gesetzten Feld.**
   `ausSuchstring(zuSuchstring(f))` ist gleich `f`. Das ist der tragende Test:
   Er fängt ein **vergessenes Feld**, was Einzelfalltests nicht tun. Wird der
   `Filter` um ein 23. Feld erweitert und das Format nicht nachgezogen,
   schlägt er fehl.
2. **Der leere Filter ergibt eine leere Adresse** — sonst trüge jede frische
   Seite Ballast.
3. **Ein unbekannter Schlüssel wird ignoriert**, ohne den Rest zu verlieren.
4. **`kpv=abc` wirft nicht** und ergibt `null`.
5. **Eine Auswahl, die nichts trifft**, wird als solche erkannt: `leergrund`
   unterscheidet „kein Bestand" von „der Filter trifft nichts". Reiner
   Logiktest, kein Komponententest -- siehe unten.

**Die Wache gegen einen trivial grünen Hin- und Rückweg:** Der Testfilter
wird **nicht** von Hand aufgezählt, sondern aus `LEERER_FILTER` abgeleitet,
sodass ein neues Feld ohne Zutun im Test landet.

## 10. Was nicht gebaut wird

- **Kein Router** und keine neue Abhängigkeit.
- **Keine Kürzel-Tabelle** für Bundesländer (Abschnitt 4).
- **`offen` kommt nicht in die URL** (Abschnitt 2).
- **Keine Kürzungs- oder Teilen-Schaltfläche.** Die Adresszeile ist die
  Schaltfläche. Ob eine eigene lohnt, entscheidet sich, wenn die URLs im
  Alltag zu lang sind — heute ist das eine Vermutung.

## 11. Was dieser Entwurf nicht hergibt

Er sagt **nicht**, wie lang die Adressen im Alltag werden. Die 22 Felder sind
gezählt, die typische Auswahl ist es nicht — dafür müsste das Dashboard
benutzt und mitgeschrieben werden. Sollte sich zeigen, dass die üblichen
Links unhandlich sind, ist das ein eigener, dann **gemessener** Punkt und
kein Grund, heute eine Kürzel-Tabelle zu bauen.
