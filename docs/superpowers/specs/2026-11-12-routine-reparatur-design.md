# Routine „Reparatur“ — Entwurf

Stand 2026-11-12. Setzt Baustein 5 aus `2026-11-11-muenchen-mietwohnung-design.md`
Abschnitt 11 um. Der Nutzer hat Weg 1 gewählt: Erkennung in `scrape.yml`,
Reparatur über die Claude-Code-GitHub-Action.

## Ziel

Bricht der Parser einer Quelle, merkt das der Nutzer sofort, und ein
Reparatur-PR entsteht ohne sein Zutun. Ein normaler Lauf kostet keine Token.

## Ablauf

```
scrape.yml  ──Lauf──▶  laeufe (Supabase)
     │
     └─ Schritt „Bruch prüfen“  (tsx scripts/pruefe-brueche.mts)
          │  liest die letzten 2 Läufe je aktiver Quelle
          ├─ Bruch      → Issue „Reparatur: <quelle>“, Label `reparatur`
          ├─ Sperre ≥ 3 → Issue „Sperre: <quelle>“,   Label `sperre` (keine Reparatur)
          └─ sonst      → nichts
                   │
reparatur.yml  ◀───┘  on: issues [opened, labeled], nur Label `reparatur`
     └─ anthropics/claude-code-action  → Branch, Fix, PR „Fixes #n“
```

## Regeln

**Bruch** (Quelle aktiv, die zwei jüngsten Läufe erfüllen beide eins davon):
- `status = 'fehler'`, oder
- `status = 'ok'` und `gesehen = 0`.

`gesperrt` ist **kein Bruch**: Gegen Sperren wird nichts umgangen. Erst ab drei
Sperren in Folge entsteht ein Hinweis-Issue mit Label `sperre`; dafür startet
keine Reparatur.

**Keine Doppelmeldung:** Ist für die Quelle schon ein Issue mit gleichem
Label offen, passiert nichts. Geschlossen wird es durch den PR oder vom Nutzer.

**Erholung:** Ein offenes Issue bleibt offen, auch wenn die Quelle wieder
liefert. Der Lauf schreibt dann einen Kommentar „liefert wieder seit Lauf …“.
So sieht der Nutzer Ausreißer und entscheidet selbst.

## Bausteine

| Teil | Aufgabe | Test |
|---|---|---|
| `scraper/lib/brueche.ts` | reine Funktion: Läufe je Quelle → `{quelle, art: "bruch"\|"sperre"\|"erholt"}[]` | Unit-Tests, ohne Netz |
| `scraper/scripts/pruefe-brueche.mts` | liest `laeufe`, ruft `brueche.ts`, legt Issues per `gh` an bzw. kommentiert | Probelauf in CI |
| `scrape.yml` | neuer letzter Schritt, `if: always()`, `GH_TOKEN` mit `issues: write` | CI-Lauf |
| `.github/workflows/reparatur.yml` | `claude-code-action`, Auftrag mit Quelle und Hinweisen | erst nach Secret |

## Auftrag an die Reparatur

Die Action bekommt einen festen Auftrag:
1. `pruefung.yml`-Wissen nutzen: Testseite der Quelle mit `hole-fixtures` holen.
   Nur lesende Abrufe, keine Sperre umgehen.
2. Parser in `scraper/scrapers/<quelle>/` anpassen, Fixture ersetzen
   (personenbezogene Namen entfernen).
3. Zuerst einen roten Test, dann Fix, dann `npm test` und `tsc --noEmit`.
4. PR mit „Fixes #n“, kein Merge.

Modell: Opus (Spec: Parser-Reparatur braucht Urteil).

## Was der Nutzer tun muss

- Einmal das Secret `ANTHROPIC_API_KEY` in GitHub anlegen. Ohne Secret laufen
  Erkennung und Issues trotzdem; `reparatur.yml` bricht dann mit einem
  klaren Hinweis ab.
- Die GitHub-App auf dem Handy pusht neue Issues; mehr Einrichtung braucht es nicht.

## Nicht Teil davon

- Kein automatischer Merge.
- Keine Reparatur bei Sperren.
- Keine tägliche Routine, keine Token ohne Bruch.
