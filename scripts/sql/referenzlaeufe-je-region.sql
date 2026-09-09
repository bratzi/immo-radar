-- Wie viele Referenzlaeufe hat jede Immowelt-Region?
--
-- Diese Zahl entscheidet spaeter darueber, ob eine Region regionsgenau
-- loeschen darf: die Mengenplausibilitaet verlangt MIN_REFERENZLAEUFE = 3
-- erfolgreiche Laeufe als Massstab (scraper/lib/plausibilitaet.ts).
--
--
-- WARUM `gemeldete_treffer is not null` NICHT OPTIONAL IST
--
-- In `sweep_region_runs` stehen 8 Altzeilen mit `vollstaendig = true`, deren
-- `gemeldete_treffer` `null` ist. Verteilung: nw 3, mv 3, bw 1, sh 1, th 1,
-- sl 1 -- alle vor dem 2026-09-09.
--
-- Sie stammen aus einem Fail-open, das es heute nicht mehr gibt:
-- `istRegionVollstaendig` (scraper/scrapers/immowelt/index.ts) lieferte bei
-- fehlender Trefferzahl `true`, sobald ueberhaupt eine Karte eingesammelt war.
-- Seit dem 2026-09-09 liefert derselbe Fall `false`. Neue Zeilen dieser Art
-- entstehen also nicht mehr; die alten stehen weiter da.
--
-- Ohne den Filter zaehlt die Abfrage genau diese Zeilen mit -- und behauptet
-- damit Referenzlaeufe fuer Regionen, fuer die nie ein Mengenmassstab
-- existierte. Am schlimmsten trifft es `nw`, die groesste Region: 3 der 8
-- Zeilen entfallen auf sie, also genau so viele, wie MIN_REFERENZLAEUFE
-- verlangt. Eine ungefilterte Abfrage meldete fuer Nordrhein-Westfalen
-- "bereit", obwohl dort kein einziger Lauf je an einer Trefferzahl gemessen
-- wurde. Was daraus folgen kann, steht in demselben Codekommentar: ein
-- soft-geblockter `nw`-Lauf mit einer einzigen Karte galt als vollstaendig
-- und haette bei regionsgenauer Loeschhoheit rund 1.160 echte Objekte zu
-- Abgaengen erklaert.
--
-- "vollstaendig = true" ist fuer diese Altzeilen also keine Aussage ueber
-- Vollstaendigkeit, sondern nur das Echo eines behobenen Fehlers. Wer den
-- Filter weglaesst, holt den Fehler in die Auswertung zurueck.
--
--
-- OFFEN, UND ZWAR ALS ENTSCHEIDUNG DES NUTZERS
--
-- Ob die 8 Altzeilen bereinigt werden (`vollstaendig` auf false setzen oder
-- die Zeilen loeschen), ist ein Schreibzugriff auf Produktionsdaten. Diese
-- Datei entscheidet das nicht und fuehrt es nicht aus. Solange die Zeilen
-- stehen, bleibt der Filter Pflicht -- auch in jeder anderen Abfrage, die
-- Referenzlaeufe zaehlt.

select partition, count(*) filter (where vollstaendig) as referenzlaeufe
from sweep_region_runs
where source = 'immowelt' and gemeldete_treffer is not null
group by partition order by referenzlaeufe desc;
