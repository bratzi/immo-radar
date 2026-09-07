# ZVG empty-region guard recalibration

## What changed

`scraper/scrapers/zvg-portal/index.ts` only. One rule.

1. **Per-region zero rows no longer voids completeness.** The `else if (treffer.length === 0)`
   branch previously did `alleLiefen = false` and logged a `console.warn` alarm
   ("nicht von einem stillen Ausfall unterscheidbar, ZVG loescht in diesem Lauf nicht").
   It now only emits a `console.log` observation:
   `ZVG-Sweep <land>: null Treffer -- dieses Bundesland hat aktuell keine passende Zwangsversteigerung gelistet.`
   The region is still kept out of `geltungsbereich` (no rows = nothing to reconcile),
   but it is no longer counted as a failure.

2. **Systemic all-empty check added in its place.** A new `trefferProRegion: number[]`
   accumulates `treffer.length` for every Bundesland that ran without an exception.
   After the loop, `istFlaechendeckenderNullausfall(trefferProRegion)` decides: if the
   list is non-empty and every entry is `0`, that is a silent failure of the search
   form and `alleLiefen` is set to `false` with a `console.warn`.

3. **Region errors and the page cap are untouched.** The `catch` block and the
   `abgeschnitten` branch still set `alleLiefen = false` exactly as before. The only
   addition on the `abgeschnitten` path is the `trefferProRegion.push` that now sits
   above the whole `if/else` — harmless, since a truncated region normally carries
   rows and, if it somehow did not, completeness is already voided by that branch.

4. **Evidence recorded in the code.** The doc comment on `istFlaechendeckenderNullausfall`
   states: two live runs on 2026-09-07 both showed exactly bw, be, hh, mv, sh empty
   out of 188 total appointments; the earlier per-region rule meant ZVG could never
   delete because the same five are empty every run ("a guard that never opens is a
   different bug"); the dangerous large-region case (NRW, 88 of 188) is caught by the
   median-history check in `lib/plausibilitaet.ts` (188 -> 100 is a 47 % drop, outside
   the 25 % tolerance), not here; a true form failure hits all regions at once, never
   reproducibly the five smallest. The post-loop call site and the inline branch both
   point back to that comment.

## Pure function: extracted

`export function istFlaechendeckenderNullausfall(trefferProRegion: number[]): boolean`
returns `trefferProRegion.length > 0 && trefferProRegion.every((anzahl) => anzahl === 0)`.

Extracted because the decision is naturally separable and there is a direct precedent:
`istRegionVollstaendig` in `scrapers/immowelt/index.ts` is an exported pure predicate
unit-tested in `scrapers/immowelt/index.test.ts`. New test file
`scraper/scrapers/zvg-portal/index.test.ts` mirrors that style with four cases:

- one region empty among several non-empty -> `false` (deletion still allowed)
- all sixteen regions empty -> `true` (deletion blocked)
- no regions at all (`[]`) -> `false`
- a single non-empty region among zeros -> `false`

## tsc

`npx tsc --noEmit` from `scraper/` -> exit 0, no output.

## npm test

`npm test` from `scraper/` -> 16 files, 229 tests, all passed (was 225 + 4 new).
`scrapers/zvg-portal/index.test.ts (4 tests)` green.

## Self-review findings

- One empty region still allows deletion: confirmed — the zero-rows branch no longer
  touches `alleLiefen`, and `.every(=== 0)` is `false` when any region has rows.
- All-empty blocks deletion: confirmed — sixteen zeros -> predicate `true` -> `alleLiefen = false`.
- Exceptions still void completeness: `catch` unchanged. (Errored regions are not pushed
  to `trefferProRegion`; an all-exception run yields `[]` -> predicate `false`, but
  `alleLiefen` is already `false` from the catch.)
- Page cap still voids completeness: `abgeschnitten` branch unchanged.
- Comment records the evidence (dates, the five codes, 188 total, NRW share, the
  47 % vs 25 % median argument) at the rule's definition, with both call sites
  referring back to it.
- `tsc` clean, all 229 tests green.

## Concerns

- Mild: if most regions error and the few survivors are all empty, the predicate
  returns `true` and logs "stiller Ausfall des Suchformulars" even though the real
  cause was the exceptions. Completeness is already voided in that case, so the only
  cost is a slightly misattributed log line. Not worth special-casing.
- `geltungsbereich` still excludes empty regions. Per `lib/bestand.ts` the
  region-level narrowing never runs in practice (it is gated behind
  `sweep.vollstaendig` and is all-or-nothing), so this only affects the
  `sweep_runs` protocol log, not deletion behaviour. Left as-is to keep the change
  to the one rule.
