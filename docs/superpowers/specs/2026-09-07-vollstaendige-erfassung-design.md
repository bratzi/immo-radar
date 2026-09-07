# Vollständige Erfassung & Bestandsführung — Design

**Stand:** 2026-09-07
**Teilprojekt 1 von 3.** Teilprojekt 2 (Mietqualität: `rent_estimates` als
Korpus, ZVG-Mieternte) und Teilprojekt 3 (Dashboard) folgen als eigene
Spec-/Plan-Zyklen.

## Ziel

Der Bestand in der Datenbank soll dem echten Marktangebot entsprechen: Was
verkauft, versteigert oder zurückgezogen wurde, verschwindet auch aus der
Datenbank. Und eine Meldung, die einmal fällig war, geht nicht mehr verloren.

## Ausgangslage

Vier Befunde aus dem Review am 2026-09-07, alle im Code belegt:

1. **Verlorene Meldungen.** Gesendet wird nur bei `diff.changed && topTreffer`
   (`pipeline.ts`). `changed` ist praktisch nur beim allerersten Sehen wahr.
   Schlägt der Telegram-Versand fehl, fängt ein `try/catch` den Fehler und
   loggt ihn nur — beim nächsten Lauf ist `changed` falsch. Die Meldung ist
   dauerhaft verloren.
2. **`notifications` ist eine Einbahnstraße.** Es wird ausschließlich
   `insert` aufgerufen, nie gelesen. Damit existiert keine Grundlage für die
   Frage „habe ich das schon gemeldet?".
3. **`listings.is_active` ist tot.** Die Spalte steht im Schema und wird nie
   gesetzt. `last_seen` wird geschrieben, aber nie ausgewertet. Verkaufte
   Objekte und Versteigerungen mit längst vergangenem Termin bleiben ewig im
   Bestand.
4. **Kein Lauf sieht das ganze Universum.** ZVG rotiert die Bundesländer und
   bricht bei einem Laufzeitbudget von 35 Minuten ab; Immowelt liest nur
   Seite 1 der bundesweiten Haus-Suche, deren Inhalt sich mit der Sortierung
   verschiebt.

Befund 4 ist der Angelpunkt: Ohne vollständige Erfassung darf man auf
Abwesenheit hin nichts löschen, weil ein halber Lauf sonst den halben Bestand
vernichtet. Die vollständige Erfassung ist deshalb Teil dieses Teilprojekts
und nicht eine spätere Ausbaustufe.

## Getroffene Entscheidungen

| Entscheidung | Begründung |
|---|---|
| Playwright wird der einheitliche Erfassungskern für **alle** Quellen | Nur ein echter Browser liefert je Lauf die vollständige Menge. Alle Alternativen (HTTP-Fetch auf Seite 1, 404-Prüfung je Objekt) sind Notbehelfe, die keine verlässliche Ist-Menge ergeben. |
| Die robots.txt-Vorgabe für Immowelt entfällt | Bewusst getroffen, siehe „Abgewogene Risiken". |
| Meldezustand kommt aus `notifications`, nicht aus neuen Spalten | Die Tabelle wurde genau dafür gebaut. Keine Migration nötig, Meldehistorie bleibt erhalten, und die Selbstheilung fällt geschenkt ab. |
| Verschwundene Objekte werden nach 2 Tagen **hart gelöscht** | Ein wieder auftauchendes Objekt legt der nächste Lauf schlicht neu an. Kein Archiv-Zustand, der gepflegt werden müsste. |
| Deaktivierung ist zeitbasiert und geltungsbereichs-beschränkt, nicht lauf-basiert | Ein teilweise fehlgeschlagener Sweep darf keine Löschung auslösen. |
| Die Abgangsmeldung geht nur an zuvor gemeldete Objekte | Bei mehreren hundert ZVG-Objekten je Lauf ist alles andere Dauerfeuer. |

## Architektur

### 1. Erfassungskern: Bestandsaufnahme von Detailerfassung trennen

Der heutige ZVG-Lauf holt für *jedes* Objekt die Detailseite. Das ist die
Ursache des Laufzeitbudgets und damit der unvollständigen Abdeckung. Die
Ergebnislisten liefern aber bereits `externalId`, Aktenzeichen und Gericht.

Deshalb zerfällt jeder Quellen-Lauf in zwei Phasen:

**Phase A — Sweep (jeder Lauf, vollständig).** Nur Ergebnislisten, keine
Detailseiten. Für ZVG heißt das: alle 16 Bundesländer, jeweils alle
Ergebnisseiten. Ergebnis ist die Menge aller aktuell angebotenen
`externalId`s. Größenordnung ~60 Anfragen, wenige Minuten.

**Phase B — Detailerfassung (selektiv).** Detailseiten werden nur geholt für

- `externalId`s, die noch nicht in der Datenbank stehen, und
- bekannte Objekte, deren jüngste `listing_version` älter als 7 Tage ist
  (fängt geänderte Verkehrswerte und verlegte Termine ein).

Nach dem ersten vollen Lauf ist Phase B fast leer. Das Laufzeitbudget von 35
Minuten und die Bundesland-Rotation entfallen ersatzlos.

Beide Quellen liefern dieselbe Struktur:

```ts
interface SweepErgebnis {
  source: string;
  /** Lief der Sweep sauber durch? Nur dann darf gelöscht werden. */
  vollstaendig: boolean;
  /** Partitionen, die sauber durchliefen (ZVG: Bundesland-Kürzel).
   *  Leer = die Quelle kennt keine Partitionierung. */
  geltungsbereich: string[];
  /** Alle im Sweep gesehenen externalIds. */
  gesehene: Set<string>;
}
```

### 2. Abdeckungsprotokoll: Löschen nur im gesehenen Geltungsbereich

Gelöscht wird ausschließlich, was der Lauf wirklich hätte sehen müssen.

- **ZVG** ist nach Bundesland partitioniert, und das Kürzel steckt bereits im
  `externalId` (`sn-40908`). Bricht der Sweep für `sn` ab, bleiben alle
  `sn-*`-Objekte unangetastet; die übrigen Länder werden normal abgeglichen.
- **Immowelt** kennt keine Partitionierung: Entweder der Sweep war
  vollständig — dann wird abgeglichen — oder er war es nicht, dann findet für
  diese Quelle in diesem Lauf keine Abgangserkennung statt.

### 3. Bestandsführung: markieren, Karenz, löschen

`listings.is_active` entfällt (tot, nie gesetzt) und wird ersetzt durch
`disappeared_at timestamptz`.

| Ereignis | Wirkung |
|---|---|
| Objekt fehlt im vollständigen Sweep seines Geltungsbereichs | `disappeared_at = now()` (nur wenn noch nicht gesetzt) |
| ZVG-Objekt, dessen `auction_at` in der Vergangenheit liegt | `disappeared_at = now()`, unabhängig davon ob noch gelistet |
| Objekt taucht wieder auf | `disappeared_at = null` |
| `disappeared_at` älter als 2 Tage | harte Löschung aus `listings`; `listing_versions` und `notifications` folgen per `on delete cascade` |

Während der Karenz bleibt das Objekt mit gesetztem `disappeared_at` sichtbar —
das ist die „ausgegraut"-Markierung auf Datenebene. Sichtbar gemacht wird sie
in Teilprojekt 3 (Dashboard); in Telegram tritt an ihre Stelle die
Abgangsmeldung.

Objekte mit gesetztem `disappeared_at` lösen keine Top-Treffer- oder
Prüfkandidat-Meldung mehr aus.

Der Termin wird zusätzlich **schon bei der Verarbeitung** geprüft, nicht erst
beim Abgleich am Laufende: Ein ZVG-Objekt, dessen `auction_at` in der
Vergangenheit liegt, ist auch dann nicht meldewürdig, wenn es noch gelistet
ist und deshalb regulär durch die Pipeline läuft. Ohne diese Vorprüfung
würde Schritt 3 des Datenflusses melden, bevor Schritt 5 markiert.

#### Mengenplausibilität als Vorbedingung des Löschens

Das Abdeckungsprotokoll erkennt einen Sweep, der *mit Fehler* abbricht. Es
erkennt nicht den gefährlicheren Fall: einen Sweep, der technisch sauber
durchläuft und trotzdem zu wenig liefert — weil sich ein Selektor geändert
hat, ein Filter anders greift oder das Portal stillschweigend weniger
ausliefert. Ein solcher Lauf würde ohne weitere Prüfung einen großen Teil des
Bestands löschen.

Vor jedem Löschvorgang gelten deshalb zwei zusätzliche Prüfungen:

1. **Selbstkonsistenz im Lauf.** Weist das Portal eine Trefferzahl aus
   („X Ergebnisse"), wird sie mit der Zahl der tatsächlich eingesammelten
   Objekte verglichen. Klaffen sie auseinander, gilt der Sweep als
   unvollständig. Liefert ein Portal keine solche Zahl, entfällt diese
   Prüfung für diese Quelle.
2. **Historienvergleich.** Die Menge dieses Laufs wird gegen den **Median der
   letzten zehn erfolgreichen Läufe** derselben Quelle gehalten — Median statt
   letzter Lauf, damit ein einzelner Ausreißer die Referenz nicht mitreißt.
   Weicht sie um mehr als **25 %** ab, wird **nicht gelöscht**; stattdessen
   geht eine Warnmeldung nach Telegram.

Die Historienprüfung greift erst, wenn für die Quelle **mindestens drei**
erfolgreiche Referenzläufe vorliegen. Bis dahin findet überhaupt keine
Löschung statt. Der Umbau startet damit bewusst vorsichtig: Die ersten Läufe
bauen nur Referenz auf.

**Hinzufügen ist von alldem nicht betroffen.** Neue Inserate werden immer
aufgenommen. Gebremst wird ausschließlich das Löschen, weil nur dort ein
Fehler Daten vernichtet.

### 4. Meldeklassen

`metrics.ts` bleibt reine Rechenlogik und weiß nichts von Mietquellen oder
Telegram. Das Feld `topTreffer` behält seinen Namen (die bereits
gespeicherten `metrics`-JSONs sollen lesbar bleiben) und bedeutet fortan
„erfüllt die Schwellen". Die Klasse bildet `pipeline.ts`:

| Bedingung | Klasse |
|---|---|
| Schwellen erfüllt **und** `rentSource === "angegeben"` | `top_treffer` |
| Schwellen erfüllt **und** Miete geschätzt | `pruefkandidat` |
| sonst | `keine` |

Rangfolge: `keine` < `pruefkandidat` < `top_treffer`.

Kennzahlen, die auf einer geschätzten Miete beruhen, sind rechnerisch eher
ein verkappter Quadratmeterpreis-Vergleich als eine Rendite. Die Trennung
macht in der Nachricht sichtbar, worauf der Empfänger schaut, ohne dass
Objekte stillschweigend unterdrückt werden.

### 5. Meldezustand: gesendet wird, wenn die Klasse steigt

Neu in `db.ts`:

```ts
hoechsteGemeldeteKlasse(supabase, listingId): Promise<Meldeklasse>
```

liest `notifications` für das Listing, betrachtet nur die `kind`-Werte
`pruefkandidat` und `top_treffer` und liefert die höchste je gemeldete Klasse
(`keine`, wenn nichts vorliegt).

Gesendet wird genau dann, wenn `aktuelleKlasse > hoechsteGemeldeteKlasse`:

- nie gemeldet und qualifiziert → senden
- war `pruefkandidat`, ist jetzt `top_treffer` → senden
- war `top_treffer`, ist es weiterhin → still
- Versand fehlgeschlagen → **keine Zeile geschrieben** → nächster Lauf sendet
  erneut

Voraussetzung dafür: `logNotification` läuft zwingend **nach** dem
bestätigten Versand, und ein Fehler darf keine Zeile hinterlassen. Der
heutige `try/catch`, der Sendefehler verschluckt, wird entsprechend
umgebaut. `diff.changed` verliert damit seine Rolle als Melde-Gate.

Die Preisänderungsmeldung bleibt unverändert an `priceDropped` hängen — sie
ist ein Ereignis, keine Klasse, und nimmt an der Rangfolge nicht teil.

### 6. Meldungstypen

| `kind` | Auslöser | Empfänger |
|---|---|---|
| `top_treffer` | Klasse steigt auf `top_treffer` | 🎯 |
| `pruefkandidat` | Klasse steigt auf `pruefkandidat` | 🔍 mit Hinweis, dass Faktor und DSCR auf einer Schätzung beruhen |
| `preisaenderung` | `priceDropped` | 💶 unverändert |
| `verschwunden` | `disappeared_at` wird gesetzt **und** für das Listing existiert bereits eine `top_treffer`- oder `pruefkandidat`-Zeile | ❌ |

Ein Objekt, das nie eine Meldung wert war, verschwindet still.

Dazu kommt die **Sweep-Warnung** (⚠️) mit erwarteter und tatsächlicher Menge
und dem Hinweis, dass die Löschung ausgesetzt ist. Sie hängt an keinem
Objekt und wird deshalb **nicht** in `notifications` protokolliert — dort ist
`listing_id` `not null`. Ihr dauerhafter Niederschlag ist die Zeile in
`sweep_runs` mit `vollstaendig = false`; Telegram bekommt sie nur zugestellt.

## Schema-Änderungen

```sql
alter table listings drop column is_active;
alter table listings add column disappeared_at timestamptz;

-- Postgres legt fuer Fremdschluessel keinen Index an; hoechsteGemeldeteKlasse
-- fragt notifications einmal je Kandidat ab.
create index notifications_listing_id_idx on notifications (listing_id);
create index listings_disappeared_at_idx on listings (disappeared_at)
  where disappeared_at is not null;

-- Referenz fuer die Mengenplausibilitaet. Ohne Historie keine Loeschung.
create table sweep_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz not null default now(),
  -- Was das Portal als Trefferzahl ausweist; null, wenn es keine nennt.
  gemeldete_treffer integer,
  -- Was der Sweep tatsaechlich eingesammelt hat.
  gesehene_objekte integer not null,
  vollstaendig boolean not null,
  geltungsbereich text[] not null default '{}'
);

create index sweep_runs_source_idx on sweep_runs (source, started_at desc);

alter table sweep_runs enable row level security;
```

`notifications.kind` ist `text` und nimmt die neuen Werte `pruefkandidat` und
`verschwunden` ohne Migration auf.

## Datenfluss eines Laufs

1. Sweep je Quelle → `SweepErgebnis` (vollständig? Geltungsbereich? gesehene
   IDs? ausgewiesene Trefferzahl?), anschließend als Zeile in `sweep_runs`
   festgehalten
2. Detailerfassung für neue und veraltete IDs
3. Je Kandidat: Kennzahlen → Upsert (`disappeared_at = null`) → Meldeklasse
   (bei vergangenem `auction_at` zwingend `keine`) → ggf. senden → bei Erfolg
   `logNotification`
4. **Plausibilitätstor je Quelle:** Selbstkonsistenz und Historienvergleich
   (Median der letzten zehn Läufe, ±25 %, erst ab drei Referenzläufen).
   Fällt eine Quelle durch, entfallen für sie die Schritte 5–7 und es geht
   eine Warnmeldung nach Telegram.
5. Abgleich: im Geltungsbereich fehlende Objekte bekommen `disappeared_at`;
   zuvor gemeldete lösen die Abgangsmeldung aus
6. ZVG-Objekte mit vergangenem `auction_at` bekommen `disappeared_at`
7. Objekte mit `disappeared_at` älter als 2 Tage werden gelöscht

Schritte 4–7 laufen am Ende, nachdem beide Quellen verarbeitet sind. Schritt 3
ist davon unabhängig — neue Objekte werden immer aufgenommen.

## Fehlerbehandlung

Die bestehende Isolation je Kandidat (`verarbeiteKandidatIsoliert` in
`main.ts`) bleibt. Ergänzend gilt:

- Scheitert ein Sweep teilweise, wird `vollstaendig`/`geltungsbereich`
  entsprechend gesetzt — der Lauf bricht nicht ab, es wird nur weniger
  gelöscht.
- Scheitert ein Sweep vollständig, findet für diese Quelle keine
  Abgangserkennung statt. Bereits gesetzte `disappeared_at`-Werte bleiben
  stehen, die Karenz läuft weiter.
- Ein Fehler beim Löschen beendet den Lauf nicht.

## Testbarkeit

Unit-testbar (reine Funktionen, wie im Projekt üblich):

- `meldeklasse(erfuelltSchwellen, rentSource, auctionAt, jetzt)` und der
  Rangfolgenvergleich — inklusive des Falls „Termin vorbei, aber noch gelistet"
- `ermittleAbgaenge(gesehene, bekannte, geltungsbereich, vollstaendig)` —
  die Abgleichlogik ohne Datenbank
- `istKarenzAbgelaufen(disappearedAt, jetzt)`
- Partitionszuordnung aus `externalId` (`sn-40908` → `sn`)
- Formatierung der Abgangsmeldung
- `istMengePlausibel(gesehene, historie, gemeldeteTreffer)` — Median über die
  Referenzläufe, 25-%-Grenze, und die Regel „unter drei Referenzläufen nie
  löschen". Das ist die Funktion, an der die Löschung hängt, und sie wird
  entsprechend dicht getestet: zu wenig Historie, Abweichung knapp innerhalb
  und knapp außerhalb der Grenze, Portal ohne ausgewiesene Trefferzahl,
  Selbstkonsistenz verletzt.

Gegen echte Dienste verifiziert (keine sinnvollen Unit-Tests): die
Playwright-Orchestrierung beider Quellen und die Löschung.

Verifikationskriterium für den Gesamtlauf: **zwei aufeinanderfolgende Läufe
ohne Marktbewegung müssen dieselbe Objektmenge liefern.** Weicht sie ab, ist
die Erfassung nicht deterministisch und die Löschung bleibt so lange
deaktiviert.

## Abgewogene Risiken

**robots.txt bei Immowelt.** Die bisherige Projektvorgabe verbot Anfragen an
`/classified-search*`, `/liste/getlistitems` und `/classifiedList/`. Genau
diese Pfade lädt Immowelt clientseitig nach, um Seite 2+ und Filter zu
liefern; ein echter Browser ruft sie zwangsläufig auf. Die Vorgabe wird
bewusst gestrichen, um für Immowelt überhaupt eine vollständige Menge zu
bekommen — ohne die darf dort nichts gelöscht werden. Eingegangenes Risiko:
Sperrung durch Immowelt. Gegenmaßnahme bleibt die bestehende Drosselung von
1 s zwischen Anfragen.

**Menge der Immowelt-Ergebnisse.** Eine vollständige Paginierung über *alle*
bundesweiten Haus-Angebote wäre nicht vertretbar. Der Sweep muss daher in der
Oberfläche auf Mehrfamilienhäuser filtern. Ob Immowelt einen solchen Filter
anbietet und wie viele Seiten er ergibt, ist **vor** der Umsetzung durch
einen Spike zu klären. Ergibt der Spike keine handhabbare Menge, wird
Immowelt aus der Abgangserkennung herausgenommen (nur ZVG löscht), und die
Entscheidung zur robots.txt ist neu zu bewerten.

**Erster Lauf nach dem Umbau feuert nach.** Weil der Meldezustand künftig aus
`notifications` kommt und dort für qualifizierte Objekte nichts steht, gelten
sie als „noch nie gemeldet". Ein Schub von einigen Dutzend Nachrichten ist zu
erwarten. Bei der bestehenden Drosselung von 500 ms je Sendung ist das
verkraftbar und einmalig.

## Bewusst nicht enthalten

- **„Wieder da"-Meldung**, wenn ein Objekt innerhalb der Karenz zurückkehrt.
  Die Meldehistorie verhindert ohnehin eine Doppelmeldung; eine zusätzliche
  Nachricht wäre Rauschen.
- **Konfigurierbare Schwellen** für `topTreffer` (aktuell fest 15 / 1,3).
  Gehört zur Bewertungslogik, nicht zur Bestandsführung.
- **Mietkorpus und ZVG-Mieternte** — Teilprojekt 2.
- **Sichtbare Ausgrauung** verschwundener Objekte — Teilprojekt 3, braucht
  eine Oberfläche. Auf Datenebene ist `disappeared_at` die Grundlage dafür.
- **Retry mit Backoff** innerhalb eines Laufs. Der 3-Stunden-Cron ist das
  Wiederholungsintervall.
