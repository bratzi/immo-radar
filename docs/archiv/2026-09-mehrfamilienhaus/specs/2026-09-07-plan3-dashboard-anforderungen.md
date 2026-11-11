# Dashboard (Teilprojekt 3) — Anforderungen

**Stand:** 2026-09-07
**Status:** Reine Anforderungssammlung. Noch kein Design, noch keine Spec.
Wird zum Ausgangspunkt des Brainstormings für Teilprojekt 3, sobald
Teilprojekt 1 (vollständige Erfassung) und 2 (Mietqualität) stehen.

## Vom Nutzer genannt (2026-09-07)

1. **Ranking statt Liste.** Die Inserate sind nach Lukrativität sortiert, das
   beste Objekt steht immer oben. Der Zweck ist Überblick: auf einen Blick
   sehen, was sich lohnt.
2. **Veränderungen sichtbar machen.** Eine Übersicht darüber, was sich
   verändert hat — nicht nur, *dass* etwas neu ist.
3. **Reihenfolge folgt der Veränderung.** Wird ein Objekt durch eine
   Preissenkung oder bessere Datenlage zu einem sehr guten Objekt, rutscht es
   im Ranking nach oben.
4. **Abgänge sichtbar.** Objekte, die nicht mehr verfügbar sind, werden
   während der zweitägigen Karenz markiert bzw. ausgegraut angezeigt — nicht
   nur neue und aktualisierte, sondern auch die herausgefallenen.

## Was dafür bereits vorliegt

Teilprojekt 1 legt die Datengrundlage, ohne dass dafür etwas Zusätzliches
gebaut werden müsste:

- Alle Kennzahlen liegen je Version im `metrics`-JSON von
  `listing_versions` — das Ranking lässt sich vollständig daraus berechnen.
- Die Historie je Objekt steckt in `listing_versions` samt `changed` und
  `price_dropped`; daraus speist sich die Veränderungs-Übersicht.
- `listings.disappeared_at` markiert Abgänge während der Karenz und ist die
  Datengrundlage für die Ausgrauung.
- `notifications` hält fest, was wann in welcher Klasse gemeldet wurde.

## Offene Design-Fragen für das Brainstorming

- **Woraus besteht „lukrativ"?** Heute gibt es mehrere Kennzahlen
  (Kaufpreisfaktor, DSCR, Nettomietrendite) und ein Schwellen-Flag, aber
  keine einzelne Rangzahl. Für ein Ranking braucht es eine definierte
  Ordnung — entweder eine gewichtete Punktzahl oder eine feste
  Sortierhierarchie.
- **Wie stark zählt Unsicherheit?** Ein Prüfkandidat beruht auf einer
  geschätzten Miete. Rangiert er gleichberechtigt mit einem Top-Treffer oder
  grundsätzlich darunter?
- **Welcher Zeitraum gilt als „verändert"?** Seit dem letzten Lauf, seit dem
  letzten Besuch des Nutzers, oder über ein festes Fenster?
- **Wer darf das Dashboard sehen?** Bisher ist alles hinter RLS ohne
  Policies; nur der Service-Key des Scrapers kommt an die Daten. Ein
  Frontend braucht eine bewusste Entscheidung dazu.
