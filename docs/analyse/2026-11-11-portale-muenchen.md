# Portale München – Erreichbarkeit und Schutz (Stand 2026-11-11)

Messung: je Portal ein einfacher HTTP-Abruf der Münchner Mietsuche bzw. Startseite
(PowerShell, Desktop-User-Agent, 2 s Abstand) plus `robots.txt`. Kein Browser.
Ein „200“ ohne Browser heißt: Liste ist ohne JavaScript lesbar; ein 401/403 heißt:
nur mit echtem Browser oder gar nicht.

| Portal | HTTP | Schutz (erkannt) | Daten im HTML | Bewertung |
|---|---|---|---|---|
| ImmoScout24 | 401 | AWS CloudFront + WAF | – | stärkster Schutz; nur sichtbarer Browser, sonst Suchauftrag |
| Immowelt | 200 | CloudFront + DataDome | JSON-LD | Liste lesbar; DataDome greift bei Takt/headless (Projekterfahrung) |
| Immonet | 403 | CloudFront + DataDome | – | gehört zu Immowelt, Daten identisch → **weglassen** |
| Kleinanzeigen | 200 | Akamai Bot Manager (`_abck`, `bm_sz`) | JSON-LD | gut lesbar, Akamai bewertet Verhalten |
| WG-Gesucht | 200 | eigener CAPTCHA-Mechanismus | JSON-LD | gut lesbar; CAPTCHA bei zu schnellem Takt |
| Wohnungsbörse.net | 200 | AWS WAF Challenge | JSON-LD | lesbar, Aggregator (viele Dubletten) |
| Immobilo | 200 | Cloudflare | JSON-LD | Aggregator, geringer Mehrwert |
| SZ-Immobilienmarkt | 200 | keiner erkannt | JSON-LD | gespeist von IS24 → Dubletten |
| Münchner Wohnen | 200 | keiner erkannt | JSON-LD | inseriert frei finanziert über IS24/Immowelt → kein eigener Scraper |
| meinestadt.de | 403 | Akamai | – | Aggregator → weglassen |
| immo.de | 200 | Cloudflare Challenge | – | Aggregator → weglassen |
| Ohne-Makler | Abbruch | Verbindung getrennt | – | in Browser prüfen |
| null-provision.de | TLS-Fehler | – | – | vermutlich inaktiv → weglassen |

`robots.txt`: ImmoScout24, Kleinanzeigen und WG-Gesucht sperren die Suchpfade für
`User-agent: *` nicht. Immowelt, Immobilo und SZ führen eigene Gruppen für
KI-Crawler (ClaudeBot u. a.); unser Crawler gibt sich nicht als solcher aus und
ruft im Auftrag des Nutzers wie ein Browser ab.

## Folgerung für die Architektur

**Quellen (Reihenfolge):** Immowelt → Kleinanzeigen → WG-Gesucht → Münchner Wohnen
→ ImmoScout24. Aggregatoren entfallen.

**Umgang mit Schutz – je Quelle eingebaut, ohne Umgehung:**

- Lokaler, sichtbarer Chromium mit dauerhaftem Profil je Quelle
  (`launchPersistentContext`), Cookies und Consent bleiben erhalten.
- Ein Tab, keine Parallelität je Quelle; Takt 30 min, Seitenabstand 4–8 s mit Zufall,
  höchstens 5 Listenseiten je Lauf.
- Detailseiten nur für neue und unklare Angebote.
- Erkennung je Antwort: 401/403, DataDome-/Akamai-/WAF-Challenge, CAPTCHA-Seite
  → Quelle sofort stoppen, Status „gesperrt“, Pause 2 h, dann 6 h; nach drei
  Sperren Telegram-Hinweis. Keine Proxys, kein Fingerprint-Spoofing, kein
  CAPTCHA-Löser.
- Lesen bevorzugt aus JSON-LD bzw. eingebettetem JSON, Selektoren nur als Rückfall.
- ImmoScout24 parallel per Suchauftrag (E-Mail) absichern, weil der Browserweg dort
  am ehesten ausfällt.

## Wann neue Angebote erscheinen (Recherche 2026-11-11)

Chrome-Erweiterung war nicht verbunden; Recherche per Websuche. Alle Zahlen
bundesweit, außer wo „München" steht.

| Befund | Quelle |
|---|---|
| Wochentage Neuangebot: Mo 17 %, Di 16 %, Mi 16 %, Fr 14 %, So 13 %, Sa 9 % | ImmoScout24, 600.000 Inserate Q1 2025 |
| Spitze 9–13 Uhr, Höchstwert 9 Uhr; Di 9–11 Uhr besonders stark; ab 20 Uhr halb so viel | ImmoScout24 Q1 2025 |
| Werktags 56 % privat, am Wochenende 81 % privat (Gewerbliche inserieren werktags) | ImmoScout24 Q1 2025 |
| 87 % Mo–Fr; Di 18,9 %, Mi 18 %; 12–13 Uhr fast jede 10. Anzeige; 23–7 Uhr nur 5,6 % | Immowelt-Auswertung |
| München: meiste Anzeigen Mo und Di, Do weniger | WG-Gesucht-Ratgeber |
| München: Inserat im Schnitt 11 Tage aktiv (2018); günstige gehen in Stunden | ImmoScout24-Auswertung |
| Münchner Wohnen: frei finanzierte Wohnungen **nur über ImmoScout24 und Immowelt**, keine Warteliste; geförderte über SOWON | Flyer Münchner Wohnen, stadt.muenchen.de |
| Genossenschaften: Projekte über die Projektbörse der mitbauzentrale München | stadt.muenchen.de |

Firmen mit festen Veröffentlichungszeiten ließen sich nicht belegen. Das Muster
„Hausverwaltung werktags vormittags, Privat abends und am Wochenende" folgt aus
den Anteilen oben.

### Folgerung für den Takt

- **Mo–Fr 8–14 Uhr:** alle 15 Minuten (Hauptfenster Gewerbe, inkl. Münchner Wohnen).
- **Mo–Fr 14–22 Uhr, Sa/So 10–20 Uhr:** alle 30 Minuten (Privatanbieter).
- **22–7 Uhr:** alle 2 Stunden.
- Münchner Wohnen braucht keinen eigenen Scraper: kommt über ImmoScout24/Immowelt.
  Filter „Anbieter = Münchner Wohnen" als Bonuspunkte (+15) in der Reihung.
- Zusätzlich: Projektbörse mitbauzentrale einmal täglich auf Neues prüfen.
- Der Takt wird nach vier Wochen eigener Daten (`erstmals_gesehen` je Stunde und
  Wochentag) neu eingestellt.
