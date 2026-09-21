#!/usr/bin/env bash
#
# Wertet einen scrape.yml-Lauf aus: Phasendauern, Kennzahlen, Fehlerzahlen.
#
# WARUM DIESES SKRIPT IM REPO LIEGT: Die Anker, an denen sich die Phasen im
# Actions-Log trennen lassen, sind nirgends sonst aufgeschrieben. Sie wurden
# am 2026-09-21 fuer die Messung der nebenlaeufigen Bewertung (BACKLOG B11)
# herausgesucht und gingen bis dahin mit jeder Sitzung verloren. Wer die
# Laufzeit einer Phase wissen will, soll nicht wieder danach suchen muessen.
#
# WACHE: Jede Kennzahl meldet ausdruecklich NICHT GEMESSEN, wenn ihr Anker im
# Log fehlt. Ohne sie sieht "nichts gefunden" aus wie "nichts vorhanden" --
# die Falle, die dieses Projekt an einem einzigen Tag dreimal erwischt hat.
#
# Aufruf: scripts/auswerte-lauf.sh <Laufnummer> [Logdatei]
#   Ohne Logdatei holt das Skript sie selbst per `gh run view --log`.
#
# Die Anker und was zwischen ihnen liegt:
#   "Immowelt-Detail:"          erste Zeile der Detailphase (vor dem Sweep)
#   "Immowelt: Sweep gestartet" Beginn des Sweeps
#   "Immowelt-Bewertung:"       Sweep fertig, Bewertung faengt an
#   "gesehenen Objekten"        Bewertung fertig
#   "ZVG-Portal: Sweep gestartet" / "Meldungen:"  ZVG davor und danach
set -u

LAUF="${1:?Laufnummer fehlt. Aufruf: scripts/auswerte-lauf.sh <Laufnummer> [Logdatei]}"
LOG="${2:-}"
if [ -z "$LOG" ]; then
  LOG="$(mktemp -t "lauf-$LAUF-XXXXXX.txt")"
  gh run view "$LAUF" --log > "$LOG" 2>/dev/null
fi

ZEILEN=$(wc -l < "$LOG")
echo "Log: $LOG ($ZEILEN Zeilen)"
if [ "$ZEILEN" -lt 10 ]; then
  echo "NICHT GEMESSEN: Log ist leer oder zu kurz -- laeuft der Lauf noch?"
  exit 1
fi

# Zeitstempel der ersten Zeile, die auf das Muster passt.
stempel() {
  local treffer
  treffer=$(grep -F -m1 "$1" "$LOG" \
    | grep -oE '20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}' | head -1)
  if [ -z "$treffer" ]; then echo "FEHLT"; else echo "$treffer"; fi
}

sekunden() { date -u -d "$1" +%s 2>/dev/null || echo FEHLT; }

dauer() { # Name, Anker davor, Anker danach
  local a b sa sb d
  a=$(stempel "$2"); b=$(stempel "$3")
  if [ "$a" = FEHLT ] || [ "$b" = FEHLT ]; then
    echo "$1: NICHT GEMESSEN (Anker fehlt: davor='$a' danach='$b')"
    return
  fi
  sa=$(sekunden "$a"); sb=$(sekunden "$b")
  if [ "$sa" = FEHLT ] || [ "$sb" = FEHLT ]; then
    echo "$1: NICHT GEMESSEN (Zeitstempel unlesbar)"
    return
  fi
  d=$((sb - sa))
  printf "%s: %d s (%d min %02d s)   [%s -> %s]\n" "$1" "$d" $((d / 60)) $((d % 60)) "$a" "$b"
}

echo
echo "== Phasendauern =="
dauer "Detailphase          " "Immowelt-Detail:" "Immowelt: Sweep gestartet"
dauer "Sweep allein         " "Immowelt: Sweep gestartet" "Immowelt-Bewertung:"
dauer "Bewertung allein     " "Immowelt-Bewertung:" "gesehenen Objekten"
dauer "Sweep + Bewertung    " "Immowelt: Sweep gestartet" "ZVG-Portal: Sweep gestartet"
dauer "ZVG                  " "ZVG-Portal: Sweep gestartet" "Meldungen:"

echo
echo "== Kennzahlen =="
# "bearbeiteten Regionen" ist die Zusammenfassung aus `laufZusammenfassung`:
# sie sagt als Einzige, ob der Lauf flach oder tief war (BACKLOG B9).
for muster in "bearbeiteten Regionen" "Immowelt-Detail:" "Immowelt-Bewertung:" \
              "gesehenen Objekten" "Meldungen:"; do
  treffer=$(grep -F "$muster" "$LOG" | sed -E 's/^[^\t]*\t[^\t]*\t//' | sed -E 's/^20[0-9]{2}-[^ ]+ //')
  if [ -z "$treffer" ]; then
    echo "$muster -> NICHT GEMESSEN (Zeile fehlt im Log)"
  else
    echo "$treffer"
  fi
done

echo
echo "== Fehlerzahlen =="
for muster in "Kandidat fehlgeschlagen" "Zeile ohne Bewertung fehlgeschlagen" \
              "Immowelt-Detailphase fehlgeschlagen" "Immowelt-Sweep abgebrochen"; do
  echo "$muster: $(grep -c -F "$muster" "$LOG")"
done
