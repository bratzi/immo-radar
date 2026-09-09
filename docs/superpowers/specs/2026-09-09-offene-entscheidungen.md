# Die Entscheidungen, an denen die Basis hängt

**Stand 2026-09-09.** Dieses Papier sammelt an einer Stelle, was nur der Nutzer
entscheiden kann — und trennt es von dem, was bisher fälschlich als seine
Entscheidung geführt wurde, sich aber selbst beantwortet hat.

## Warum es dieses Papier gibt

Von den fünf offenen Abnahmekriterien in [`ABNAHME-BASIS.md`](../ABNAHME-BASIS.md)
hängen **drei an einer Entscheidung**, eines nur an **Zeit**, und nur eines ist
echte Arbeit:

| Kriterium | Blockiert durch |
|---|---|
| A-3 Cron liefert verlässlich | Entscheidung — **löst sich auf**, siehe unten |
| A-4 Kein Objekt fällt still aus dem Radar | Entscheidung 2 |
| B-1 Jedes Bundesland einmal erfasst | nur Zeit, die Rotation läuft |
| B-2 Verschwundenes Objekt wird erkannt | Arbeit (Option 3) |
| D-5 Meldebudget nicht ausgeschöpft | Entscheidung 1 |

Die Basis lässt sich also durch Programmieren fast nicht weiter voranbringen.
Das ist der Grund, warum dieses Papier vor weiterem Code steht.

---

## Entscheidung 1 — Darf eine bundeslandgenaue Mietschätzung eine Telegram-Meldung auslösen?

**Das ist die teuerste offene Frage.** Sie entscheidet nicht nur, *ob* gemeldet
wird, sondern über Wochen hinweg, *was zuerst*.

### Was gemessen ist

- Die Bundeslandstufe trägt **83 % des Bestands** (1.758 von 2.108 Versionen)
  und stellt **339 der 409 Meldekandidaten**.
- Sie ist keine eigene Recherche, sondern mittelt die vorhandenen
  PLZ-Werte des Landes — und ebnet dabei genau die Spanne ein, auf die es
  ankommt:

  ```
  Nordrhein-Westfalen   6,50 bis 16,50 €/m²   -37,1 % bis +59,7 %
  Bayern                8,00 bis 20,50 €/m²   -34,8 % bis +67,1 %
  ```

  **7 von 16 Bundesländern verlassen intern das ±30-%-Band, und dort liegen
  1.202 von 1.879 bewerteten Objekten — 64 %.**
- Nachgerechnet mit den echten Funktionen über alle 1.879 bewertbaren Objekte,
  Miete ×0,7 / ×1,0 / ×1,3: **558 Objekte (29,7 %) wechseln irgendwo im Band
  die Meldeklasse.**
- **`top_treffer` bleibt in allen drei Szenarien 0.** Eine falsche Schätzung
  kann nie einen Top-Treffer erzeugen, ausschließlich einen `pruefkandidat`.
- Das Meldebudget liegt bei 25 je Lauf und war zuletzt ausgeschöpft: **25
  gesendet, 117 zurückgestellt.**

Die Tabelle selbst ist dabei **besser als ihr Ruf**: gegen Zensus 2022/BBSR
geprüft, n = 23, Median −11,4 %, 17 von 23 innerhalb ±15 %. Gegen drei direkt
veröffentlichte BBSR-Angebotsmieten ohne Umrechnung: München −2,4 %, Frankfurt
−0,8 %, Stuttgart −6,4 %. Sie ist nicht geraten. Der schwache Punkt ist nicht
ihr Niveau, sondern die Einebnung auf Bundeslandebene.

### Die Möglichkeiten

**(a) Alles bleibt.** Bundeslandgenaue Schätzungen melden weiter. Der Rückstand
von 117 Meldungen bleibt und wächst; jede vierte Meldung beruht auf einer Zahl,
die im halben Land um mehr als 30 % danebenliegen kann.

**(b) Bundeslandgenaue Schätzungen melden nie.** Sie werden gespeichert und
später im Dashboard gezeigt, lösen aber keine Nachricht aus. Das entleert den
Rückstand sofort und macht jede Telegram-Nachricht wieder aussagekräftig.
**Der Preis:** Solange das Dashboard nicht existiert, fallen damit rund 83 %
der Meldungen ersatzlos weg — praktisch alle.

**(c) Getrennte Budgets.** Bundeslandgenaue Schätzungen melden weiter, aber mit
eigenem, kleinem Kontingent (etwa 5 von 25), damit ein Objekt mit belegter oder
PLZ-genauer Zahl nie hinter ihnen ansteht. Der Rückstand schrumpft langsamer,
aber die Reihenfolge stimmt.

### Empfehlung

**(c) jetzt, (b) sobald das Dashboard steht.** Grund: (b) ist der richtige
Endzustand — eine Telegram-Nachricht soll heißen „das lohnt einen Blick", nicht
„die Handtabelle vermutet etwas". Aber (b) heute umgesetzt schaltet die einzige
Ausgabe des Projekts ab, die es gibt. (c) stellt sofort die Reihenfolge richtig,
ohne etwas abzuschalten, und ist rückstandslos rücknehmbar.

**Gegen (a) spricht Gemessenes, nicht Geschmack:** Der Rückstand von 117
Meldungen bedeutet, dass die Reihenfolge über Wochen wirkt. Ein Mietfehler von
±30 % verschiebt sie um rund ±200 Objekte.

---

## Entscheidung 2 — Wird ein Objekt ohne Preis gespeichert statt fallengelassen?

Betrifft **A13 Schritt 2** (Immowelt, „Preis auf Anfrage") und **A6** (ZVG, das
Gericht hat den Verkehrswert ausgelassen). Beides läuft auf dieselbe Frage
hinaus und gehört zusammen entschieden. **Daran hängt Abnahmekriterium A-4:**
„Kein Objekt fällt still aus dem Radar."

### Was gemessen ist

- **Immowelt:** Die Quote schwankt zwischen 0 % und 6,5 % je Lauf — und die
  Schwankung misst die **Region**, nicht die Datenqualität. Der Parser liest
  **1.758 von 1.758** echten Listentiteln richtig. Eine preislose Karte trägt
  wörtlich „Preis auf Anfrage"; das ist die Quelle, nicht der Code.
- **ZVG:** 3 von 194 Fällen (1,5 %), und über acht aufeinanderfolgende Läufe
  **immer exakt dieselben drei IDs**. Sie bilden einen stehenden Rückstand:
  jeder Lauf holt sie erneut und verwirft sie erneut.
- **Strukturell geht es heute nicht:** `listing_versions.price_cents` ist
  `bigint not null` (`schema.sql`), und `PipelineCandidate.priceCents` ist
  `number`.

### Die Möglichkeiten

**(a) Eine `listings`-Zeile ohne `listing_versions`-Zeile anlegen.** Keine
Schemaänderung. Das Objekt bleibt sichtbar und taucht im Bestandsabgleich auf,
wird aber nicht bewertet. Berührt `bestandDb.ts` und damit die Löschwachen.

**(b) `price_cents` nullbar machen**, plus Lückencode `preis_auf_anfrage`
analog zu `wohnflaeche_fehlt`. Sauberer — aber eine **Migration auf
Produktionsdaten**, und sie berührt jede Metrik, die `priceCents / 100` rechnet.

### Empfehlung

**(a) zuerst.** Sie erfüllt A-4 wörtlich — das Objekt ist nach dem Lauf noch
auffindbar — ohne eine Migration auf Produktionsdaten und ohne jede Metrik
anzufassen. (b) ist der sauberere Endzustand und lässt sich später nachziehen,
wenn sich zeigt, dass preislose Objekte tatsächlich bewertet werden sollen.
Umgekehrt ginge es schlechter: Eine Migration zurückzunehmen ist teuer.

**Vorsicht bei (a):** Sie berührt die Löschwachen. Eine `listings`-Zeile ohne
Bewertung darf nie als Abgang gelten, nur weil sie keine Version trägt.

### Ein Nebenpunkt, der keine Entscheidung braucht, aber Aufräumen

Der Bestandseintrag zu `zvg_id=13233` trägt **78.031 €**. Diese Zahl steht auf
keiner Seite — eine frühere Fassung von `parseGermanNumber` hat die Ziffern aus
„Blatt **7803** lfd.Nr. **1**" zusammengeklebt. Der Fehler ist seit `fe5749a`
behoben, der falsche Wert steht aber noch da und wird nie überschrieben, weil
das Objekt nie wieder erfasst wird. Nachgerechnet über alle 193 gespeicherten
ZVG-Objekte ist es der **einzige** Abweichler.

Ihn zu korrigieren ist ein Schreibzugriff auf Produktionsdaten. Er gehört
zusammen mit Entscheidung 2 erledigt, nicht davor.

---

## Was sich aufgelöst hat und keine Entscheidung mehr braucht

### A10 — der Crontakt bleibt bei drei Stunden

Bisher als offene Abwägung geführt: Ein dichterer Cron fängt die **43 %
ausgefallenen Termine** auf, erhöht aber die Tagesmenge an Abrufen bei
Immowelt — und genau die misst ein CAPTCHA.

**Die Fortsetzungsrotation vom 2026-09-09 entzieht der Frage die Grundlage.**
Der Startindex kam früher aus der Wanduhr; ein ausgefallener Lauf übersprang
damit einen Versatz. Jetzt kommt er aus `sweep_region_runs` und zeigt auf die
Region, die am längsten nicht gesweept wurde. **Ein ausgefallener Cron-Termin
kostet damit Zeit, aber keine Abdeckung** — der nächste Lauf holt genau das
nach, was liegengeblieben ist. Die Rotation heilt sich selbst, und zwar
unabhängig davon, wie oft der Cron auslöst.

Gerechnet über 3.000 Monte-Carlo-Durchläufe: volle Abdeckung im Median in
**5,7 statt 13,1 Tagen**, 90. Perzentil 7,6 statt 20,2 — **ohne einen einzigen
zusätzlichen Abruf**. Ein Stunden-Cron käme auf 4,2 Tage. Der Gewinn wäre also
1,5 Tage, bezahlt mit der dreifachen Tagesmenge an Abrufen bei einer Quelle,
die ihre Abrufrate misst.

**Entscheidung: bleibt bei drei Stunden.** Wird revidiert, wenn die Ausfallquote
über 43 % steigt oder eine Region nachweislich hängenbleibt.

### Die 157 Objekte ohne Fundort bleiben stehen

Sie sind Altbestand aus der Zeit vor der Fundort-Spalte. Ein fehlender Fundort
heißt „nicht zuzuordnen", und Unzuordenbares ist nie ein Abgang — so ist der
Code heute schon gebaut, fail-closed. Sie einmalig zu verwerfen wäre ein
Schreibzugriff auf Produktionsdaten für einen Nutzen, den niemand benennen
kann. Sie verschwinden von selbst, sobald sie erneut gesehen werden.

---

## Was ausdrücklich zurückgestellt ist

Nicht weil es falsch wäre, sondern weil es an dieser Stelle mehr Genauigkeit
kauft, als das Ergebnis trägt.

| Punkt | Warum zurückgestellt |
|---|---|
| **A16** — zweiter Vollständigkeitsmaßstab | Voraussetzung für B1, und B1 ist im eigenen Entwurf verworfen. Unter Option 3 kostet ein Fehlurteil graue Darstellung. 13 von 16 Regionen nennen ihre Trefferzahl ohnehin. |
| **B1** — regionsgenaues Löschen | Selbst mit reparierter Trefferzahl erlaubt die 25-%-Toleranz einen Lauf mit 75 % Ausbeute, also **bis zu 1.724** echte Objekte in einem Zug. Gelöschte Zeilen sind weg, ausgegraute nicht. |
| **A11 Schritt 3 / B3** — 95 PLZ-Werte gegen INKAR-Kreise validieren | Die Zuordnung müsste von Hand entstehen. Die Tabelle ist bereits mit n = 23 geprüft, Median −11,4 %. Und gemessen kann eine falsche Schätzung **nie** einen Top-Treffer erzeugen. Die Antwort auf die Unschärfe ist, sie im Ranking **sichtbar** zu machen, nicht sie wegzurechnen. |
| **B4** — Einheitenzahl belastbarer machen | Dieselbe Begründung: gehört in die Unsicherheitsdarstellung des Dashboards, nicht in eine genauere Schätzung. |
