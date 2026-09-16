#!/usr/bin/env bash
#
# Stellt `node_modules` in einem git-Worktree bereit -- OHNE Netz.
#
# WARUM ES DIESES SKRIPT GIBT: Ein git-Worktree teilt die Historie mit dem
# Hauptcheckout, aber nicht die ignorierten Verzeichnisse. `node_modules` fehlt
# dort also. Der naheliegende Griff ist `npm ci` -- und genau der hat am
# 2026-09-09 den Anschluss des Nutzers belastet, als drei Subagenten ihn
# gleichzeitig taten. Nicht die Datenmenge ist das Problem, sondern hunderte
# gleichzeitige Verbindungen; dasselbe Muster hat das Heimnetz schon zweimal
# lahmgelegt (siehe scraper/lib/nurInCi.ts).
#
# ZWEI TEILPROJEKTE, seit die Weboberflaeche existiert (2026-09-15): `scraper/`
# und `web/` haben je ein eigenes `node_modules`. Bis zum 2026-09-16 behandelte
# dieses Skript nur `scraper/` -- ein Agent mit einer Aufgabe in `web/` stand
# damit vor genau der Luecke, die ihn zu `npm install` greifen laesst. Beide
# werden jetzt versorgt; fehlt eines im Hauptcheckout, wird es uebersprungen
# statt zum Fehler gemacht.
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
TEILPROJEKTE="scraper web"

# Verknuepft EIN Teilprojekt. Gibt 0 zurueck, wenn danach node_modules steht.
verknuepfe() {
  local teilprojekt="$1"
  local quelle="$QUELLE_REPO/$teilprojekt/node_modules"
  local ziel="$(pwd)/$teilprojekt/node_modules"

  if [ ! -d "$QUELLE_REPO/$teilprojekt" ]; then
    echo "$teilprojekt: gibt es im Hauptcheckout nicht -- uebersprungen."
    return 0
  fi

  if [ ! -d "$quelle" ]; then
    echo "$teilprojekt: Quelle fehlt ($quelle)." >&2
    echo "  Im Hauptcheckout einmal 'cd $teilprojekt && npm ci' laufen lassen -- dort und nur dort." >&2
    return 1
  fi

  if [ -e "$ziel" ]; then
    echo "$teilprojekt: node_modules steht bereits."
    return 0
  fi

  mkdir -p "$(dirname "$ziel")"

  # Windows-Pfade fuer mklink; `pwd -W` gibt den echten Laufwerkspfad.
  local ziel_win quelle_win
  ziel_win="$(cd "$(dirname "$ziel")" && pwd -W | sed 's|/|\\|g')\\node_modules"
  quelle_win="$(cd "$quelle" && pwd -W | sed 's|/|\\|g')"

  if cmd //c mklink //J "$ziel_win" "$quelle_win" >/dev/null 2>&1; then
    echo "$teilprojekt: Junction angelegt -> $quelle_win"
  elif cmd //c mklink //D "$ziel_win" "$quelle_win" >/dev/null 2>&1; then
    echo "$teilprojekt: symbolischer Link angelegt -> $quelle_win"
  else
    echo "$teilprojekt: Link nicht moeglich, kopiere -- das dauert, bleibt aber lokal."
    # /E alle Unterverzeichnisse, /NFL /NDL /NJH /NJS ohne Dateiliste,
    # /NP ohne Fortschrittsprozente. robocopy meldet Erfolg mit Code < 8.
    cmd //c robocopy "$quelle_win" "$ziel_win" //E //NFL //NDL //NJH //NJS //NP >/dev/null 2>&1 || true
    if [ ! -d "$ziel" ]; then
      echo "$teilprojekt: Kopie fehlgeschlagen. NICHT auf npm ausweichen -- das geht ins Netz." >&2
      return 1
    fi
    echo "$teilprojekt: kopiert nach $ziel"
  fi
  return 0
}

fehler=0
for teilprojekt in $TEILPROJEKTE; do
  verknuepfe "$teilprojekt" || fehler=1
done
[ "$fehler" -eq 0 ] || exit 1

# ACHTUNG BEIM AUFRAEUMEN: Die Junctions zeigen auf die ECHTEN node_modules des
# Hauptcheckouts. Ein `rm -rf` auf den Worktree kann ihnen folgen und das Ziel
# mitnehmen. Erst `cmd //c "rmdir scraper\node_modules"` und dasselbe fuer
# `web`, dann den Rest loeschen.
echo "Probe: beide Testsuiten muessen ohne Netz starten."
for teilprojekt in $TEILPROJEKTE; do
  [ -d "$teilprojekt/node_modules" ] || continue
  echo "--- $teilprojekt ---"
  ( cd "$teilprojekt" && npx vitest run --reporter=dot 2>&1 | tail -3 )
done
