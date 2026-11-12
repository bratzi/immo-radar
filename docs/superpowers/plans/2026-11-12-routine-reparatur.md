# Routine „Reparatur“ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein gebrochener Parser erzeugt ein Issue und startet einen Reparatur-PR; ein normaler Lauf kostet keine Token.

**Architecture:** Reine Funktionen in `scraper/lib/brueche.ts` werten die letzten Läufe aus und planen Issue-Aktionen. Ein dünnes Skript `scraper/scripts/pruefe-brueche.mts` liest `laeufe` und führt die Aktionen mit `gh` aus. Es ist der letzte Schritt in `scrape.yml`. `reparatur.yml` ruft `anthropics/claude-code-action` auf.

**Tech Stack:** TypeScript, vitest, Supabase JS, GitHub CLI, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-12-routine-reparatur-design.md`

## Global Constraints

- Bruch: Quelle aktiv, und die zwei jüngsten Läufe sind beide `status='fehler'` oder beide `status='ok'` mit `gesehen=0`.
- `gesperrt` ist kein Bruch. Ab 3 Sperren in Folge entsteht ein Issue „Sperre: <quelle>“ mit Label `sperre`, aber keine Reparatur.
- Keine Doppelmeldung: Ist für die Quelle schon ein Issue mit diesem Label offen, passiert nichts.
- Erholung: Das Issue bleibt offen, der Lauf kommentiert nur „liefert wieder seit Lauf …“.
- Kein automatischer Merge. Modell für die Reparatur: Opus.
- Ohne `ANTHROPIC_API_KEY` bricht `reparatur.yml` mit einem klaren Hinweis ab.

## Abweichung von der Spec (technisch erzwungen)

Issues, die mit dem `GITHUB_TOKEN` angelegt werden, starten keine `issues`-Workflows (Regel von GitHub gegen Endlosschleifen). Deshalb startet das Skript `reparatur.yml` nach dem Anlegen zusätzlich per `workflow_dispatch` mit der Issue-Nummer. `issues: labeled` bleibt bestehen, damit der Nutzer eine Reparatur auch von Hand auslösen kann.

## Review Focus

1. Eine Quelle hat erst 1 Lauf: Das ist kein Bruch.
2. Gemischte Fehlerarten (ein `fehler`, dann `ok/0`) zählen ebenfalls als Bruch.
3. Erholung wird nur einmal kommentiert, beim Übergang von schlecht auf gut, nicht bei jedem Lauf.
4. Inaktive Quellen (immowelt) melden nie etwas.
5. Ein Fehler im Prüfschritt (Supabase oder gh nicht erreichbar) darf den Scan nicht rot färben, er wird nur geloggt.

---

### Task 1: `brueche.ts` – Bewertung und Aktionsplan

**Files:** Create `scraper/lib/brueche.ts`, Test `scraper/lib/brueche.test.ts`

**Interfaces – Produces:**
- `interface LaufKurz { status: string; gesehen: number; gestartet_am: string }`
- `type Befund = { quelle: string; art: "bruch" | "sperre" | "erholt"; seit: string }`
- `bewerteQuelle(quelle: string, laeufe: LaufKurz[]): Befund | null`, mit `laeufe` neueste zuerst
- `interface OffenesIssue { number: number; title: string; labels: string[] }`
- `type Aktion = { typ: "anlegen"; titel: string; label: "reparatur" | "sperre"; text: string } | { typ: "kommentar"; nummer: number; text: string }`
- `planeAktionen(befunde: Befund[], offen: OffenesIssue[]): Aktion[]`
- `issueTitel(art: "bruch" | "sperre", quelle: string): string` → „Reparatur: x“ / „Sperre: x“

- [ ] Write the tests (Bruch ok/0 ×2, fehler ×2, gemischt, nur 1 Lauf, 2× gesperrt kein Befund, 3× gesperrt sperre, Erholung nur beim Übergang, Doppelmeldung unterdrückt, Erholung kommentiert offene Issues beider Labels, keine Erholung ohne offenes Issue).
- [ ] Run them and watch them fail (Modul fehlt).
- [ ] Implement the code.
- [ ] Run the tests until green. Sabotage check: undo one rule and see a test turn red.
- [ ] Commit.

### Task 2: Skript und Schritt in `scrape.yml`

**Files:** Create `scraper/scripts/pruefe-brueche.mts`, Modify `.github/workflows/scrape.yml`

- The script reads the 3 newest runs for each active source (`QUELLEN.filter(aktiv)`) from `laeufe`.
- It gets the open issues with `gh issue list --state open --json number,title,labels`.
- It creates both labels idempotently with `gh label create --force`.
- It runs each action. After every `anlegen` with label `reparatur`, it also runs `gh workflow run reparatur.yml -f issue=<n>`.
- A failure is only logged (exit 0).
- `scrape.yml`:
  - `permissions: contents: read, issues: write, actions: write`;
  - last step `if: always()`, `GH_TOKEN: ${{ github.token }}`.
- [ ] `npx tsc --noEmit`, commit.

### Task 3: `reparatur.yml`

**Files:** Create `.github/workflows/reparatur.yml`

- Triggers: `issues: [labeled]` (only label `reparatur`) and `workflow_dispatch` with input `issue`.
- First step: check the secret. If it is missing, write `::error::` and exit 1.
- `anthropics/claude-code-action@v1`:
  - give it the fixed instructions from the spec;
  - model `claude-opus-5-5`;
  - PR with "Fixes #n", no merge.
- [ ] Validate the YAML, commit, push to main, check the next scan run.
