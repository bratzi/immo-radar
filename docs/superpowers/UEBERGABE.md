# Übergabe — Stand 2026-09-11

> **Zuerst lesen:** dieses Dokument, dann [`ABNAHME-BASIS.md`](ABNAHME-BASIS.md)
> (woran „die Basis steht" gemessen wird), dann
> [`specs/2026-09-09-offene-entscheidungen.md`](specs/2026-09-09-offene-entscheidungen.md)
> (was noch dem Nutzer gehört), dann [`BACKLOG.md`](BACKLOG.md) und
> [`TODO.md`](TODO.md).

## Wo wir stehen

`main` = `935207c`, Arbeitsverzeichnis sauber. **423 Tests grün** (Sitzungsbeginn:
397), `npx tsc --noEmit` sauber. Alle vier Agenten-Worktrees dieser Sitzung sind
gemergt und abgeräumt.

**Der wichtigste Befund dieser Sitzung ist keine Zeile Code, sondern eine
Verhältniszahl.** Von fünf offenen Abnahmekriterien hingen **drei an einer
Entscheidung**, eines nur an **Zeit**, und nur B-2 war echte Arbeit. Die Basis
ließ sich durch Programmieren fast nicht weiter voranbringen — das ist der
Grund, warum diese Sitzung mit einer Neupriorisierung begonnen hat statt mit
einem Umbau.

**Was geschlossen wurde:** Option 3 (Immowelt markiert Abgänge, löscht sie nie),
das getrennte Meldekontingent, die vierte Fail-open-Stelle, der Dashboard-Entwurf
und zwölf Doku-Stellen, die dem Code widersprachen.

**Was als Nächstes kommt:** Ein Produktionslauf, der Option 3 belegt. Der Code
steht, der Beleg fehlt — und ohne ihn gilt B-2 nicht als erfüllt.

---

## Option 3 ist gebaut: markieren ohne löschen

Abnahmekriterium B-2 verlangt wörtlich, dass ein verschwundenes Immowelt-Objekt
als verschwunden **erkannt** wird — nicht, dass es gelöscht wird. Bis zu dieser
Sitzung trugen **null** Immowelt-Objekte ein `disappeared_at`.

### Der Entwurf hängt an einer einzigen Frage

**Wieviel Beweislast eine Markierung trägt, hängt daran, ob die Quelle
überhaupt löschen darf.** Das ist der ganze Kern von `ermittleMarkierungen`
(`lib/bestand.ts`):

- **Mit Löschhoheit** ist die Markierung der **erste Schritt der Löschung** —
  nach der Karenz räumt `loescheAbgelaufene` sie hart weg. Sie trägt deshalb
  dieselbe Beweislast wie die Löschung selbst: quellenweite Mengenprüfung und
  `vollstaendig`. Für ZVG ändert sich nichts.
- **Ohne Löschhoheit** ist die Markierung ein **reversibler Endzustand**. Dann
  genügt der Regionsbeweis: Markiert wird nur, wessen Fundort eine Region ist,
  die in **diesem** Lauf ihre Vollständigkeit gegen die vom Portal ausgewiesene
  Trefferzahl belegt hat.

**Warum die quellenweite Prüfung für Immowelt der falsche Maßstab ist:** Sie
vergleicht gegen einen historischen Median, und bei einer rotierend erfassten
Quelle misst dieser Median nur die Rotation — gemessen 3.361 bis 9.329 Objekte
je Lauf, Faktor 2,8. Sie wäre dort ein permanentes Nein, also nie eine
Markierung. Der Regionsbeweis vergleicht stattdessen gegen eine **Live-Wahrheit**.

### Die harte Löschung bleibt gesperrt, und zwar an einer Stelle

Sie hängt allein an `QUELLEN_MIT_LOESCHHOHEIT` in `bestandDb.ts`, und dort steht
`immowelt` nicht. Neu ist `quelleHatLoeschhoheit`, damit die Liste von außen
lesbar ist statt still in einer Abfrage zu stecken. **Ein zweites Verzeichnis
wäre der falsche Weg** — zwei Listen, die auseinanderlaufen können, sind genau
die Bauart, aus der die bisherigen Fail-open-Stellen entstanden sind.

**Sabotageprobe:** Trägt man `immowelt` in die Erlaubnisliste ein, fallen drei
Tests. Übergeht man die Mengenprüfung bei einer Quelle mit Löschhoheit, fällt
einer.

### Die bewusste Lücke

`nw`, `bw` und `mv` nennen ihre Trefferzahl nirgends (gemessen 2026-09-09, weder
im Titel noch im Seitentext). Sie erreichen den Geltungsbereich nie, also wird
dort **nie etwas markiert**. Das ist kein Versehen: `nw` allein ist 21,2 % des
Bestands, und solange der zweite Vollständigkeitsmaßstab fehlt (A16, bewusst
zurückgestellt), ist Nichtstun die richtige Antwort.

**Fürs Dashboard heißt das:** Fehlendes Grau ist kein Beleg für Verfügbarkeit.
Der Entwurf löst das mit drei Zuständen statt zwei — verfügbar, **unbestätigt**,
abgängig.

### Die vierte Fail-open-Stelle, gefunden beim Umbau

`regionErfassen` **weiß**, wenn die Blätterung am Seitendeckel des Portals
endet — die Region ist dann nachweislich unvollständig erfasst. Dieser Befund
wurde bisher nur geloggt und floss nicht in `istRegionVollstaendig` ein.

Solange nichts markiert wurde, kostete das nichts. Mit Option 3 wäre es ein
Loch: Der Deckel liegt bei rund 10.000 Objekten; meldet das Portal 10.000 bis
13.333, landet die abgeschnittene Menge zufällig innerhalb der 25-%-Toleranz,
die Region käme in den Geltungsbereich, und die abgeschnittenen Objekte wären
Abgänge.

**Ein bekannter Unvollständigkeitsbefund darf nie in eine
Vollständigkeitsaussage münden.** Das dritte Argument ist verpflichtend und hat
keinen Vorgabewert — ein stilles `false` wäre genau die Sorte Vorgabe, die einen
unbekannten Zustand als „in Ordnung" liest.

### Der Deckel, den die Verdrahtung nötig gemacht hat

`ermittleMarkierungen` war gebaut und getestet, aber **von niemandem
aufgerufen** — damit blieb B-2 unerfüllt. Beim Verdrahten fiel auf, dass die
Abgangsmeldung ungedeckelt lief: Bis heute markierte allein ZVG mit ein bis zwei
Objekten je Lauf, deshalb fiel es nie auf. Mit Immowelt holt der erste Lauf
danach einen Rückstand auf, der seit Projektbeginn gewachsen ist — jedes Objekt,
das je in den Chat kam und inzwischen weg ist, in **einem** Lauf.

Dieses Projekt hat den Nutzer schon einmal mit 318 Meldungen geflutet; deshalb
gibt es `MAX_MELDUNGEN_JE_LAUF` überhaupt. Eine Markierung freizugeben, ohne die
Meldeseite zu deckeln, wäre derselbe Fehler an der Nachbarstelle.
`MAX_ABGANGSMELDUNGEN_JE_LAUF = 10`.

**Was der Deckel kostet, und warum es vertretbar ist:** Die überzähligen
Abgänge werden **nicht** nachgeholt — sie sind markiert und tauchen nicht erneut
als neuer Abgang auf. Ihr Verschwinden bleibt unbemeldet, aber nicht unbemerkt:
`disappeared_at` steht in der Datenbank, und genau daraus lebt die ausgegraute
Darstellung. **Der Deckel kostet eine Chat-Nachricht, keine Information.**

---

## Das Meldebudget hat jetzt eine Reihenfolge

D-5 war offen, weil das Budget von 25 dauerhaft ausgeschöpft ist — zuletzt 25
gesendet, **117 zurückgestellt**. Die Ursache war nicht die Menge, sondern die
**Reihenfolge**: Die nur landesweit geschätzte Mietstufe stellt **339 von 409**
Kandidaten und beherrschte die Liste allein durch ihre Masse. Ein Objekt mit
belegter oder PLZ-genauer Miete stand hinter Dutzenden Schätzungen an, bei 117
Zurückgestellten über Wochen hinweg.

Sie bekommt jetzt **5 der 25 Plätze**. **Es fällt nichts weg:** Bleiben Plätze
frei, weil es weniger gut belegte Kandidaten gab, gehen sie am Ende des Laufs
über `holeNach` doch an die zurückgestellten landesweiten. Der Durchsatz sinkt
nicht, nur die Reihenfolge stimmt.

**Die Stufe kommt aus der getypten `MietQuelle`, nicht aus der Datenlücke**
`miete_nur_bundeslandgenau`. Die Lücke ist nur deren Ableitung und liegt in
einem Set mit Zeichenketten, die der jeweilige Scraper beisteuert. Ein Merkmal,
das entscheidet **wer** gemeldet wird, darf nicht an einer Zeichenkette aus dem
Parser hängen.

**Rücknehmbar ohne Rest:** Kontingent gleich Maximum verhält sich exakt wie der
Code davor, und genau das steht unter Test. Das ist die Sicherheitsleine, falls
der Nutzer A11 Schritt 4 anders entscheidet.

**Sabotageproben:** Ignoriert `darfSenden` das Kontingent, fallen fünf Tests.
Ignoriert `holeNach` das Gesamtbudget, fallen drei.

---

## Der Dashboard-Entwurf steht — und hat eine tote Schwelle gefunden

`specs/2026-09-09-dashboard-entwurf.md`, 739 Zeilen, **keine Zeile Frontend-Code**
(die Reihenfolge „Basis vor Dashboard" gilt weiter).

**Die Rangzahl ist der DSCR, keine erfundene Punktzahl.** Nachgerechnet und
bestätigt: `geschaetzterDscr` ist exakt `nettomietrenditeCapRate / 6`, und
`bruttomietrendite` ist `100 / kaufpreisfaktor`. Von fünf Kennzahlen bleiben
damit **zwei** unabhängige Ordnungen; eine gewichtete Summe hätte dieselbe
Information doppelt gezählt.

**Eine der vier `topTreffer`-Bedingungen ist tot.** `finanzierungsrisiko` kippt
erst unterhalb DSCR ≈ 0,81–0,84 (gerechnet über Kaufnebenkosten von 8,57 % bei
3,5 % Grunderwerbsteuer bis 11,57 % bei 6,5 %). Die Schwelle verlangt aber
`DSCR >= 1,3`. Innerhalb von `topTreffer` kann sie **nie** die bindende
Bedingung sein. Eigene Nachrechnung bestätigt beides.

**Unsicherheit wird als Band geführt, nicht als Punkt**, und sortiert wird nach
der **ungünstigen Bandkante** — dadurch ist breite Unschärfe eine Zurückstufung
statt einer neutralen Eigenschaft. Vier Sicherheitsstufen, ohne Schemaänderung,
als **getrennte Blöcke statt einer Liste**: Der Wechselkurs zwischen belegter
und geschätzter Miete ist bei zwei belegten Objekten im ganzen Bestand nicht
messbar, also wird er nicht behauptet.

**Nicht beurteilbare Objekte bekommen keinen Rangplatz und keine Kennzahl** —
kein grauer DSCR 0,0, sondern der Grund im Klartext. Für ein Ranking-Dashboard
ist *geprüft und schlecht* der gefährlichste Zustand, den *nicht beurteilbar*
annehmen kann.

**Der Zeitraum ist historienrelativ statt kalenderrelativ.** `changed` und
`price_dropped` vergleichen die Vorversion desselben Objekts, nicht einen
Zeitpunkt — strukturell immun gegen 43 % Cron-Ausfall und 5,7 Tage
Regionsabstand. Ein 24-Stunden-Fenster wäre für die meisten Regionen leer.

**Zugriff:** Snapshot-Export durch den Lauf, der den Service-Key ohnehin hält —
der einzige Weg, der **null Änderungen an der Produktionsdatenbank** verlangt
und strukturell keinen Schreibzugriff verlieren kann. Die Alternativen stehen
mit ihren Anforderungen als Nutzerentscheidung im Entwurf.

---

## Zwei Entscheidungen sind gefallen, ohne dass sie dem Nutzer vorgelegt wurden

Beide waren als „Entscheidung des Nutzers" geführt und haben sich bei genauem
Hinsehen selbst beantwortet. Begründung in
[`specs/2026-09-09-offene-entscheidungen.md`](specs/2026-09-09-offene-entscheidungen.md).

**Der Cron bleibt bei drei Stunden (A10).** Die Fortsetzungsrotation entzieht
der Abwägung die Grundlage: Der Startindex kam früher aus der Wanduhr, ein
ausgefallener Lauf übersprang damit einen Versatz. Jetzt zeigt er auf die
Region, die am längsten nicht gesweept wurde. **Ein ausgefallener Termin kostet
Zeit, aber keine Abdeckung.** Ein Stunden-Cron kaufte 1,5 Tage mit der
dreifachen Tagesmenge an Abrufen bei einer Quelle, die genau die misst.

**Die 157 Objekte ohne Fundort bleiben stehen.** Ein fehlender Fundort heißt
„nicht zuzuordnen", und Unzuordenbares ist nie ein Abgang — so ist der Code
schon gebaut. Sie einmalig zu verwerfen wäre ein Schreibzugriff auf
Produktionsdaten für einen Nutzen, den niemand benennen kann.

## Die eine Entscheidung, die offen bleibt

**Wird ein Objekt ohne Preis gespeichert statt fallengelassen?** Betrifft A13
Schritt 2 (Immowelt, „Preis auf Anfrage") und A6 (ZVG, das Gericht hat den
Verkehrswert ausgelassen). Daran hängt A-4.

Empfehlung: **eine `listings`-Zeile ohne `listing_versions`-Zeile**. Sie erfüllt
A-4 wörtlich, ohne Migration auf Produktionsdaten und ohne jede Metrik
anzufassen. `price_cents` nullbar zu machen ist der sauberere Endzustand und
lässt sich später nachziehen; umgekehrt ginge es schlechter.

**Vorsicht:** Auch die empfohlene Variante berührt die Löschwachen. Eine
`listings`-Zeile ohne Bewertung darf nie als Abgang gelten, nur weil sie keine
Version trägt.

---

## Was als Nächstes zu tun ist

1. **Einen Produktionslauf fahren und Option 3 belegen.** Der Code steht, der
   Beleg fehlt. Zu prüfen: Tragen Immowelt-Objekte jetzt `disappeared_at`? Bleibt
   die Zahl plausibel, oder markiert ein Lauf auf einen Schlag Hunderte? Greift
   der Deckel? **Ohne diesen Lauf gilt B-2 nicht als erfüllt** — dieses Projekt
   belegt Abnahmen an echten Läufen, nicht an Tests.
2. **Denselben Lauf für D-5 mitlesen.** Sinkt die Zahl der Zurückgestellten, und
   stehen unter den Gesendeten jetzt besser belegte Objekte?
3. **Die offene Entscheidung klären** (Objekt ohne Preis), dann A-4 schließen.
4. **Danach das Dashboard**, in der Reihenfolge des Entwurfs: erst die
   Messfragen, dann `lib/ranking.ts` als reine Funktion mit TDD, dann der
   Snapshot-Export — und erst danach die erste Zeile Oberfläche.

## Ausdrücklich zurückgestellt, mit Begründung

Nicht weil es falsch wäre, sondern weil es mehr Genauigkeit kauft, als das
Ergebnis trägt.

| Punkt | Warum |
|---|---|
| **A16** zweiter Vollständigkeitsmaßstab | Voraussetzung für B1 — und B1 ist im eigenen Entwurf verworfen. Unter Option 3 kostet ein Fehlurteil graue Darstellung. 13 von 16 Regionen nennen ihre Trefferzahl ohnehin. |
| **B1** regionsgenaues Löschen | Selbst mit reparierter Trefferzahl erlaubt die 25-%-Toleranz einen Lauf mit 75 % Ausbeute, also bis zu **1.724** echte Objekte in einem Zug. Gelöschte Zeilen sind weg, ausgegraute nicht. |
| **A11 Schritt 3 / B3** INKAR-Validierung | Die Zuordnung von 95 PLZ-Werten zu Referenzkreisen müsste von Hand entstehen. Die Tabelle ist mit n = 23 geprüft, Median −11,4 %. Und eine falsche Schätzung kann **nie** einen Top-Treffer erzeugen. Die Antwort auf die Unschärfe ist, sie sichtbar zu machen. |
| **B4** Einheitenzahl | Dieselbe Begründung: gehört in die Unsicherheitsdarstellung, nicht in eine genauere Schätzung. |

---

## Werkzeuge und Zugänge

| Zugang | Umfang |
|---|---|
| GitHub (Windows-Credential-Manager) | OAuth-Token `gho_…`, Scopes `repo, workflow, gist`, Konto `bratzi` |
| Supabase Management-PAT | DDL, Logs, Secrets — in `scraper/.env` |
| Supabase Service-Key | volle Datenrechte, umgeht RLS |
| Telegram-Bot | `Immo2501bot` |

**`gh` ist installiert, aber nicht eingeloggt.** Je Aufruf:

```bash
export PATH="$PATH:/c/Program Files/GitHub CLI"
export GH_TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | sed -n 's/^password=//p')
```

**Die Tokenfrage ist geschlossen** (A2, Entscheidung des Nutzers vom
2026-09-08). Nicht wieder aufbringen.

---

## Fallen, die schon zugeschnappt sind

**Nie einen Live-Lauf lokal.** [`lib/nurInCi.ts`](../../scraper/lib/nurInCi.ts)
bricht `npm run scrape` und jedes Prüfskript ohne `CI` ab. Der Anschluss des
Nutzers ist zweimal ausgefallen. Prüfungen laufen über
[`pruefung.yml`](../../.github/workflows/pruefung.yml), volle Läufe über
`gh workflow run scrape.yml --ref main`.

**Ein Prüflauf gegen EINE Region kostet fast nichts und beantwortet mehr als
jede Vermutung.** Drei solche Läufe haben A15 entschieden, nachdem drei
Sitzungen darüber spekuliert hatten.

**Subagenten in Worktrees brauchen `node_modules` — und `npm ci` ist dafür der
falsche Weg.** Der richtige steht in
[`scripts/worktree-node-modules.sh`](../../scripts/worktree-node-modules.sh):
Verzeichnis-Junction, Symlink, notfalls lokale Kopie, kein Netz. Ein
Agentenauftrag verbietet Netzkommandos ausdrücklich.

**Ein abgebrochener Agent ist nicht wertlos — erst in seinen Worktree sehen.**
Zum zweiten Mal belegt: Diese Sitzung verlor zwei Agenten am Sitzungslimit. Der
eine hatte seine Arbeit fertig und grün, nur nicht committet; der andere hatte
die vierte Fail-open-Stelle gefunden. Beides wäre verloren gewesen, hätte
jemand neu angefangen statt hineingesehen.

**Eine Prämisse im Agentenauftrag kann selbst veraltet sein.** Der Auftrag
„README behauptet, der Cron sei pausiert" stammte aus einem To-do-Eintrag, der
seit vier Tagen überholt war. Der Agent hat es gemerkt und gemeldet, statt eine
Korrektur zu erfinden. **Der Fehler lag beim Koordinator, nicht beim Agenten** —
wer aus einer Doku einen Auftrag schneidet, prüft die Doku zuerst am Code.

**`printf` und das Prozentzeichen.** Eine Commit-Nachricht mit `8,2 %` bricht
mitten im Satz ab. Längere Nachrichten über eine Datei und `git commit -F`.

**Ein Test, der am Kalender hängt, ist eine Zeitbombe.** Wer Testdaten mit Datum
baut, macht sie relativ zur Uhr oder friert die Uhr ein.

**Eine Fehlermeldung, die eine Ursache behauptet, ist gefährlich.** Erst messen.

**Wer eine Grenze entfernt, muss die dahinter suchen.**

**Ein grüner Test beweist nichts, wenn er nie rot war.** Bei jedem Test, der
sofort grün ist: Produktionscode kurz kaputtmachen und zusehen, ob der Test es
merkt. Diese Sitzung hat es fünfmal getan.

**Fail-open in den Löschwachen ist der teuerste Fehler.** In `bestand.ts`,
`plausibilitaet.ts`, `bestandDb.ts` und `scrapers/immowelt/index.ts` gilt: ein
unbekannter Zustand ist `null`/`false`, nie „in Ordnung". **Vier** Stellen sind
inzwischen geschlossen — die vierte fiel erst auf, als Option 3 sie erreichbar
machte. Wer eine fünfte findet, schließt sie sofort: Sie kosten nichts, solange
sie unerreicht sind, und alles, sobald sie erreicht werden.

**Immowelt ist nicht gesperrt, headless wird erkannt.** `headless: true` → HTTP
403 mit CAPTCHA; `headless: false` → 200. In CI unter `xvfb-run`.

**Ein CAPTCHA wird nicht gelöst.** Es misst eine zu hohe Abrufrate.

**Immowelt-Detailseiten (`/expose/`) sind von Rechenzentrums-Adressen gesperrt.**
Bewertung kommt aus der Titelzeile der Ergebnisliste. Deshalb gibt es keine PLZ
und die Miete ist bundeslandgenau.

**Leere Bundesländer sind bei ZVG normal.**

**Die `\n`-Falle beim Schreiben von Dateien.** Bei größeren Dateien das
Write-Werkzeug nehmen, nicht ein Heredoc.

**`tsx` und `page.evaluate`.** Verschachtelte Funktionen im `evaluate`-Rumpf
brechen mit `ReferenceError: __name is not defined`. Alles flach halten.
