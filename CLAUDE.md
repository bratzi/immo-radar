# immo-radar — Arbeitsweise für Claude

## Caveman aktiv

CAVEMAN AKTIV (Stufe full, Projekt immo-radar). Gilt ab der ersten Antwort, ohne `Skill(caveman)` zu laden.

Antworten:
- Deutsch, knapp. Keine Floskeln, kein Füllwort, kein Absichern. Fragmente erlaubt.
- Kein Vorwort vor Tool-Aufrufen, kein Zwischenstand zwischen Aufrufen, keine Ankündigung des nächsten Schritts.
- Keine Zusammenfassung, die wrap_up oder die Antwort selbst schon enthält. Keine Deko-Tabellen, kein Emoji.
- Fachbegriffe, Code, Befehle, Fehlertexte exakt. Keine erfundenen Abkürzungen, keine Pfeile.
- "nicht/nie/nur/außer" nie streichen. Zahlen und Einheiten exakt.
- Klartext statt Caveman bei: Sicherheitswarnung, Bestätigung vor nicht umkehrbarer Aktion, mehrschrittiger Anleitung mit Verwechslungsgefahr, Rückfrage des Nutzers.
- Normale Prosa in allem, was das Chatfenster verlässt: Commits, Code-Kommentare, Doku im Repo, Gedächtnisdateien.

Credits sparen:
- Dateien nur im nötigen Ausschnitt lesen (offset/limit, Grep vor Read). UEBERGABE.md nur bis "Offen".
- Logs und Testausgaben kürzen: `tail`, `grep`, `--json` mit Feldauswahl. Nie ganze CI-Logs holen.
- Unabhängige Aufrufe in eine Nachricht bündeln.
- Subagent nur bei echtem Bedarf; Auftrag mit komprimierter Rückgabe (cavecrew-Stil, Pfad:Zeile). Modell nach Schwere wählen.
- Keine Wiederholung von bereits Festgestelltem; kein erneutes Lesen gerade bearbeiteter Dateien.

Umschalten: "/caveman lite|ultra", "normal mode" schaltet ab.

## Skill-Auswahl (nur bei Auslöser laden, nie alle)

| Auslöser | Skill |
|---|---|
| UI/UX am Radar-Artifact (Karten, Layout, Filter) | `artifact-design` zuerst (Seitenvertrag), dann `C:\immo-radar\.agents\skills\frontend-design-direction\SKILL.md` direkt lesen (Richtung, Zustände, Prüfliste; das Skript `check-evidence.js` fehlt bewusst) |
| Diagramme, Kennzahl-Kacheln, Kartenfarben | `dataviz` |
| Abschluss einer UI-Änderung | `web-design-guidelines`, bei Farben/Kontrast `design-accessibility-review` |
| Beschriftungen, Leertexte, Fehlermeldungen in der Oberfläche | `ux-copy-refiner` |
| Bug, unerwartetes Verhalten | `superpowers:systematic-debugging` |
| Neue Funktion | `superpowers:brainstorming`, danach `lean-build` |

Quelle der Auswahl: verified-skill.com, Design-Rangliste (Stand 2026-11-12). Die anderen zertifizierten Design-Skills sind hier schon installiert oder passen nicht (z. B. `quickdesign` ist Video-KI, `build-dashboard` baut eigenständige HTML-Dateien statt eines Data-Artifacts).
