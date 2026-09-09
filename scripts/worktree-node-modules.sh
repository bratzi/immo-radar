#!/usr/bin/env bash
#
# Stellt `scraper/node_modules` in einem git-Worktree bereit -- OHNE Netz.
#
# WARUM ES DIESES SKRIPT GIBT: Ein git-Worktree teilt die Historie mit dem
# Hauptcheckout, aber nicht die ignorierten Verzeichnisse. `node_modules` fehlt
# dort also. Der naheliegende Griff ist `npm ci` -- und genau der hat am
# 2026-09-09 den Anschluss des Nutzers belastet, als drei Subagenten ihn
# gleichzeitig taten. Nicht die Datenmenge ist das Problem, sondern hunderte
# gleichzeitige Verbindungen; dasselbe Muster hat das Heimnetz schon zweimal
# lahmgelegt (siehe scraper/lib/nurInCi.ts).
#
# Dieses Skript kommt ohne eine einzige Netzverbindung aus. Es probiert drei
# Wege, vom billigsten zum teuersten:
#
#   1. Verzeichnis-Junction auf den Hauptcheckout -- sofort, null Bytes, kein
#      Admin noetig. Der Normalfall.
#   2. Symbolischer Link -- falls Junctions scheitern.
#   3. Kopie mit robocopy -- dauert, belegt Platz, bleibt aber lokal.
#
# Aufruf aus dem Wurzelverzeichnis des Worktrees:
#
#     bash scripts/worktree-node-modules.sh
#
# Optional ein anderer Hauptcheckout als Quelle:
#
#     bash scripts/worktree-node-modules.sh /c/anderer/pfad
#
set -euo pipefail

QUELLE_REPO="${1:-/c/immo-radar}"
QUELLE="$QUELLE_REPO/scraper/node_modules"
ZIEL="$(pwd)/scraper/node_modules"

if [ ! -d "$QUELLE" ]; then
  echo "Quelle fehlt: $QUELLE" >&2
  echo "Im Hauptcheckout einmal 'cd scraper && npm ci' laufen lassen -- dort und nur dort." >&2
  exit 1
fi

if [ -e "$ZIEL" ]; then
  echo "node_modules steht bereits: $ZIEL"
  exit 0
fi

# Windows-Pfade fuer mklink; `pwd -W` gibt den echten Laufwerkspfad.
ziel_win="$(cd "$(dirname "$ZIEL")" && pwd -W | sed 's|/|\\|g')\\node_modules"
quelle_win="$(cd "$QUELLE" && pwd -W | sed 's|/|\\|g')"

if cmd //c mklink //J "$ziel_win" "$quelle_win" >/dev/null 2>&1; then
  echo "Junction angelegt: $ziel_win -> $quelle_win"
elif cmd //c mklink //D "$ziel_win" "$quelle_win" >/dev/null 2>&1; then
  echo "Symbolischer Link angelegt: $ziel_win -> $quelle_win"
else
  echo "Link nicht moeglich, kopiere -- das dauert, bleibt aber lokal."
  # /E alle Unterverzeichnisse, /NFL /NDL /NJH /NJS ohne Dateiliste,
  # /NP ohne Fortschrittsprozente. robocopy meldet Erfolg mit Code < 8.
  cmd //c robocopy "$quelle_win" "$ziel_win" //E //NFL //NDL //NJH //NJS //NP >/dev/null 2>&1 || true
  if [ ! -d "$ZIEL" ]; then
    echo "Kopie fehlgeschlagen. NICHT auf npm ausweichen -- das geht ins Netz." >&2
    exit 1
  fi
  echo "Kopiert nach: $ZIEL"
fi

echo "Probe: die Testsuite muss ohne Netz starten."
( cd scraper && npx vitest run --reporter=dot 2>&1 | tail -3 )
