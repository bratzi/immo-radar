# Option 3 — markieren ohne löschen: Umsetzungsplan

> **Für agentische Bearbeiter:** Schritte sind Checkboxen. TDD ist Pflicht:
> erst der Test, ihn **rot sehen**, dann die minimale Umsetzung.

**Ziel:** Ein verschwundenes Immowelt-Objekt wird regionsgenau als
verschwunden **markiert** — und nie gelöscht (Abnahmekriterium B-2).

**Architektur:** `vollstaendig` trägt künftig nur noch die quellenweite
Beweislast der **Löschung**. Die reversible **Markierung** läuft über den
Regionsbeweis (`geltungsbereich` + `listings.fundort`). Unterschieden wird
über die bestehende Erlaubnisliste `QUELLEN_MIT_LOESCHHOHEIT`, exportiert als
`quelleHatLoeschhoheit(source)`.

**Tech-Stack:** TypeScript, vitest, Supabase-Client.

**Spec:** [`../specs/2026-09-09-option3-markieren-ohne-loeschen.md`](../specs/2026-09-09-option3-markieren-ohne-loeschen.md)

## Globale Randbedingungen

- `QUELLEN_MIT_LOESCHHOHEIT` bleibt `["zvg-portal"]`. `immowelt` wird dort
  **niemals** eingetragen.
- `ermittleAbgaenge` bleibt wörtlich unverändert, ebenso sein Test
  *„meldet NICHTS, solange der Immowelt-Sweep unvollständig ist"*.
- Ein unbekannter Zustand ist `null`/`false`, nie „in Ordnung".
- Kein Netzkommando. `node_modules` per `scripts/worktree-node-modules.sh`.
- Vor jeder Erfolgsmeldung: `npx vitest run` und `npx tsc --noEmit` in
  `scraper/`. Ausgangsstand 397 grüne Tests.

## Dateien

| Datei | Verantwortung |
|---|---|
| `scraper/lib/bestand.ts` | Neue reine Funktion `ermittleMarkierungen`. Gemeinsamer privater Filter mit `ermittleAbgaenge`. |
| `scraper/lib/bestand.test.ts` | Tests dazu. |
| `scraper/lib/bestandDb.ts` | `quelleHatLoeschhoheit(source)` exportiert. |
| `scraper/lib/bestandDb.test.ts` | Tests dazu. |
| `scraper/scrapers/immowelt/index.ts` | `istRegionVollstaendig` bekommt `abgeschnitten` als dritten, verpflichtenden Parameter. |
| `scraper/scrapers/immowelt/index.test.ts` | Test dazu, bestehende Aufrufe um `false` ergänzt. |
| `scraper/main.ts` | `gleicheBestandAb` markiert über `ermittleMarkierungen`; die quellenweite Prüfung verriegelt nur noch Quellen mit Löschhoheit. |

---

### Task 1: `ermittleMarkierungen`

**Dateien:** `scraper/lib/bestand.ts`, `scraper/lib/bestand.test.ts`

**Schnittstelle (produziert):**

```ts
export interface Markierbefugnis {
  hatLoeschhoheit: boolean;
  quellenPruefungBestanden: boolean;
}

export function ermittleMarkierungen(
  sweep: SweepErgebnis,
  bekannte: BekanntesListing[],
  befugnis: Markierbefugnis
): BekanntesListing[];
```

Regeln:
1. `hatLoeschhoheit && !quellenPruefungBestanden` → `[]`
2. `hatLoeschhoheit` → identisch zu `ermittleAbgaenge` (inkl. `vollstaendig`)
3. sonst → regionsgenau, **ohne** `vollstaendig`-Wache

- [ ] **Schritt 1:** Tests schreiben (acht Fälle, siehe Spec „Prüfungen" 1–6).
- [ ] **Schritt 2:** `npx vitest run lib/bestand.test.ts` — muss rot sein
      („ermittleMarkierungen is not a function").
- [ ] **Schritt 3:** Minimal umsetzen: privaten Filter `nichtMehrGesehen`
      aus `ermittleAbgaenge` herausziehen, `ermittleMarkierungen` darauf
      aufsetzen. `ermittleAbgaenge` behält Signatur und Verhalten.
- [ ] **Schritt 4:** `npx vitest run lib/bestand.test.ts` — grün.
- [ ] **Schritt 5:** Sabotageprobe: `if (!sweep.vollstaendig) return []` in
      `ermittleMarkierungen` einsetzen → die Markiertests ohne Löschhoheit
      müssen rot werden. Zurücknehmen.
- [ ] **Schritt 6:** Commit.

---

### Task 2: `quelleHatLoeschhoheit`

**Dateien:** `scraper/lib/bestandDb.ts`, `scraper/lib/bestandDb.test.ts`

**Schnittstelle:** `export function quelleHatLoeschhoheit(source: string): boolean`

- [ ] **Schritt 1:** Tests: `zvg-portal` → `true`, `immowelt` → `false`,
      unbekannte Quelle → `false`.
- [ ] **Schritt 2:** rot sehen.
- [ ] **Schritt 3:** Funktion über die bestehende Konstante umsetzen.
- [ ] **Schritt 4:** grün.
- [ ] **Schritt 5:** Commit.

---

### Task 3: `abgeschnitten` schlägt auf die Regionsvollständigkeit durch

**Dateien:** `scraper/scrapers/immowelt/index.ts`, `…/index.test.ts`

**Schnittstelle:**
`istRegionVollstaendig(gesammelt: number, gemeldet: number | null, abgeschnitten: boolean): boolean`

- [ ] **Schritt 1:** Test: eine Region, deren Menge die Toleranz erfüllt,
      gilt **nicht** als vollständig, sobald `abgeschnitten` gilt.
- [ ] **Schritt 2:** rot sehen.
- [ ] **Schritt 3:** `if (abgeschnitten) return false;` als erste Zeile;
      beide Aufrufstellen in `sweepImmowelt` reichen `abgeschnitten` durch;
      bestehende Testaufrufe um `false` ergänzen.
- [ ] **Schritt 4:** grün, `npx tsc --noEmit` sauber.
- [ ] **Schritt 5:** Commit.

---

### Task 4: `gleicheBestandAb` markiert regionsgenau

**Datei:** `scraper/main.ts`

- [ ] **Schritt 1:** `ermittleAbgaenge` durch `ermittleMarkierungen` ersetzen,
      `quelleHatLoeschhoheit(sweep.source)` durchreichen.
- [ ] **Schritt 2:** Die frühe Rückkehr bei geschlossener quellenweiter
      Prüfung nur noch für Quellen **mit** Löschhoheit; die Logzeile bzw. die
      Telegram-Warnung bleibt für beide.
- [ ] **Schritt 3:** `npx vitest run` und `npx tsc --noEmit`.
- [ ] **Schritt 4:** Commit.

## Selbstprüfung

- Spec-Abdeckung: Frage 1–3 → Task 1 (Tests 2–4). Frage 4 → Task 4
  (quellenweite Prüfung verriegelt nur noch Löschquellen). Frage 5 → Task 2.
  Vierte Fail-open-Stelle → Task 3. Zuschnitt 13/16 → bereits durch
  `istRegionVollstaendig(…, null)` erzwungen, in Task 3 kommentiert.
- Keine Platzhalter, keine offenen Typen.
- Namen durchgängig: `ermittleMarkierungen`, `Markierbefugnis`,
  `quelleHatLoeschhoheit`, `abgeschnitten`.
