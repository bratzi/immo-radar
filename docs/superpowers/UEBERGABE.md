# Übergabe — Stand 2026-09-07

Dieses Dokument ist der Einstiegspunkt für die nächste Sitzung. Es soll
verhindern, dass irgendetwas davon noch einmal hergeleitet werden muss.

## Wo wir stehen

`main` = `137ba2d`, gepusht, Arbeitsverzeichnis sauber. 229 Tests grün,
`npx tsc --noEmit` sauber. Der Cron läuft alle drei Stunden über GitHub
Actions.

Teilprojekt 1 („Vollständige Erfassung & Bestandsführung") ist umgesetzt,
gemergt und live. Spec und Plan liegen in `docs/superpowers/`.

## Was jetzt funktioniert

**Meldungen gehen nicht mehr verloren.** Früher wurde nur bei
`diff.changed && topTreffer` gesendet — praktisch nur beim allerersten Sehen —
und ein `try/catch` verschluckte Sendefehler. Jetzt entscheidet die
`notifications`-Tabelle: gesendet wird, wenn die Meldeklasse eines Objekts
steigt, und die Protokollzeile entsteht erst **nach** bestätigtem Versand.
Ohne Zeile gilt das Objekt im nächsten Lauf weiter als nie gemeldet — der
Fehlschlag heilt sich selbst.

**Der Bestand wird geführt.** Was im vollständigen Sweep fehlt, bekommt
`disappeared_at` und wird nach zwei Tagen Karenz hart gelöscht. Taucht es
vorher wieder auf, fällt die Markierung.

**Drei Sicherungen vor jeder Löschung**: Abdeckungsprotokoll,
Selbstkonsistenz gegen die vom Portal ausgewiesene Trefferzahl, und der
Median der letzten zehn erfolgreichen Läufe bei 25 % Toleranz — wirksam erst
ab drei Referenzläufen. Durchgängig gilt: **wer nicht urteilen kann, löscht
nicht.**

**Die Phasentrennung trägt.** Lauf 1 holte 185 ZVG-Detailseiten, Lauf 2 nur
noch drei. Genau dafür wurde sie gebaut.

## Offene Punkte, in dieser Reihenfolge

### 1. Consent-Fix live verifizieren

`137ba2d` ist getestet, aber **nicht gegen die echte Seite gelaufen**.

Belegt ist: Das Usercentrics-Overlay fing jeden Paginierungs-Klick ab
(30-s-Timeout, sechzehn von sechzehn Regionen). Nach erfolgreichem Zustimmen
blätterte es — 84 statt 42 Objekte in Bremen. Der Selektor
`[data-testid="uc-accept-all-button"]` (Beschriftung „OK") ist der richtige.

Das Timing war das Problem: Der Host-Div `#usercentrics-root` hängt sofort an,
der Dialog-Inhalt kommt später in den Shadow Root. `137ba2d` wartet deshalb
pro Kandidat auf den Knopf selbst statt auf die Hülle.

**Prüfung:** eine Region, ~10 Abrufe. Erwartung: Bremen kommt auf ~209 statt
42 Objekte.

### 2. Determinismus-Nachweis (Task 14, Step 2)

Zwei aufeinanderfolgende Läufe müssen dieselbe Objektmenge liefern, bevor der
Löschung zu trauen ist. Bis dahin greift ohnehin die
Drei-Referenzläufe-Sperre — **es wird nichts gelöscht**.

```sql
select source, gesehene_objekte, gemeldete_treffer, vollstaendig, started_at
from sweep_runs order by started_at desc limit 10;
```

Schwanken die `gesehene_objekte` stark, stimmt etwas mit der Erfassung nicht.

### 3. Immowelt-Löschhoheit

Immowelt meldet strukturell `vollstaendig: false` und löscht nie. Der Sweep
läuft in rotierenden Zeitscheiben (`SWEEP_BUDGET_MS`, 12 min), weil sonst das
CAPTCHA unter Last zurückkehrt. Für die Löschhoheit bräuchte jedes Listing
eine **Fundort-Spalte** — Immowelts UUID verrät den Ort nicht, anders als
ZVGs `sn-40908`. Eigenes Arbeitspaket.

### 4. Danach: Teilprojekt 2 und 3

Mietqualität (`rent_estimates` als Korpus, ZVG-Mieternte) und das Dashboard.
Anforderungen dafür liegen in
`docs/superpowers/specs/2026-09-07-plan3-dashboard-anforderungen.md`.

## Fallen, die schon zugeschnappt sind

**Nie einen bundesweiten Lauf über den Anschluss des Nutzers.** Ein voller
lokaler Sweep hat dessen Heimnetz lahmgelegt — nicht die Datenmenge, sondern
tausende parallele Verbindungen und DNS-Abfragen aus einem Browser mit
Fenster. Der Scraper gehört in CI. Lokal höchstens **eine** Region.

**Immowelt ist nicht gesperrt — headless wird erkannt.** Direkter Vergleich,
gleiche URL: `headless: true` → HTTP 403 plus DataDome-CAPTCHA;
`headless: false` → HTTP 200 mit vollem Datenmodell. Deshalb läuft Chromium
mit Fenster, in CI unter `xvfb-run`. Nicht auf headless „zurückoptimieren".

**Ein CAPTCHA wird nicht gelöst.** Es ist ein Messwert, kein Hindernis: es
sagt, dass die Abrufrate zu hoch war. Antwort darauf ist Drosselung (5 s bei
Immowelt), nicht Umgehung.

**Detailseiten brauchen eine warme Sitzung.** Ein frischer Browser, der
direkt auf eine Exposé-URL geht, bekommt eine 403-Hülle, und der Parser
meldet dann „Datenmodell fehlt". `erfasseImmoweltDetails` lädt deshalb erst
eine Suchseite. Der ZVG-Scraper macht es nebenan genauso.

**Leere Bundesländer sind bei ZVG normal.** Baden-Württemberg, Berlin,
Hamburg, Mecklenburg-Vorpommern und Schleswig-Holstein hatten in beiden
Läufen null passende Zwangsversteigerungen. Eine Regel „leere Region →
Quelle unvollständig" bedeutet, dass ZVG **nie** löscht. Nur ein
flächendeckender Nullausfall zählt als Störung.

## Was die Reviews gefunden haben

Neun echte Fehler, acht davon im Plan, keiner in der Umsetzung. Der teuerste:
`vollstaendig` wurde mit Fail-open-Vergleichen gegen genau die Werte
berechnet, die das Symptom des Fehlers sind — eine leere Trefferliste und
eine fehlende Trefferzahl galten als „vollständig". Ein still geblocktes
Nordrhein-Westfalen (21,2 % des Bestands, innerhalb der 25 %-Toleranz) hätte
rund 7.500 echte Objekte gelöscht.
