"""Bewertungs-Engine: aus Kennzahlen und Textsignalen wird ein Score 0–100.

Jedes Kriterium liefert einen Teilscore zwischen 0 und 1, der über eine
stückweise lineare Rampe aus zwei Schwellen (``schlecht`` → ``gut``) entsteht.
Die Gewichte und Schwellen stehen komplett in der config.yaml – so lässt sich
das Raster an eine beliebige Anlagestrategie anpassen, ohne Code zu ändern.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .models import Evaluation, Finance, Listing
from .util import normalize


def ramp(value: float, schlecht: float, gut: float) -> float:
    """Lineare Rampe: bei ``schlecht`` 0, bei ``gut`` 1, dazwischen interpoliert.

    Funktioniert in beide Richtungen – ``schlecht`` darf größer sein als ``gut``
    (z. B. beim Kaufpreisfaktor, wo klein besser ist).
    """
    if schlecht == gut:
        return 1.0 if value >= gut else 0.0
    t = (value - schlecht) / (gut - schlecht)
    return max(0.0, min(1.0, t))


# Positive Signale: deuten auf Verhandlungsspielraum oder Wertpotenzial hin.
OPPORTUNITY_SIGNALS: dict[str, str] = {
    r"provisionsfrei|ohne makler|maklerfrei|von privat|privatverkauf": "Provisionsfrei / Privatverkauf",
    r"erbengemeinschaft|nachlass|erbschaft|erbfall": "Erbengemeinschaft / Nachlass",
    r"zwangsversteigerung|zvg|insolvenz|insolvenzverwalter": "Zwangsversteigerung / Insolvenz",
    r"schnellentschlossene|zeitnah|kurzfristig|schneller verkauf|muss verkauft": "Verkaufsdruck",
    r"vb|verhandlungsbasis|preis verhandelbar|verhandelbar": "Preis verhandelbar",
    r"renovierungsbedarf|sanierungsbedarf|modernisierungsbedarf|handwerker|bastler|"
    r"in die jahre gekommen|renovierungsbeduerftig": "Renovierungsbedarf (Wertsteigerungspotenzial)",
    r"leerstand|teilweise vermietet|teilleerstand": "Leerstand (Mietanpassung möglich)",
    r"unter (?:dem )?(?:markt|verkehrs)wert|guenstig abzugeben|preis gesenkt|preisreduziert": "Preis unter Marktniveau angedeutet",
    r"mietanpassung|miete unter|mieten unter|mietpotenzial|mietsteigerungspotenzial": "Mietsteigerungspotenzial",
    r"kapitalanlage|anlageobjekt|renditeobjekt|rendite": "Als Kapitalanlage inseriert",
}

# Risiken: mindern den Score, sind aber kein automatischer Ausschluss.
RISK_SIGNALS: dict[str, str] = {
    r"denkmalschutz|denkmalgeschuetzt": "Denkmalschutz (Auflagen, aber AfA-Vorteil)",
    r"asbest|schimmel|hausschwamm|feuchtigkeit im keller": "Bausubstanz-Risiko",
    r"sanierungsstau|generalsanierung|kernsanierung erforderlich|komplettsanierung": "Erheblicher Sanierungsstau",
    r"energieausweis.{0,40}\b(g|h)\b|energieklasse\s*[gh]\b": "Sehr schlechte Energieklasse",
    r"gewerbe(?:einheit|anteil)|teilgewerblich": "Gewerbeanteil (Finanzierung schwieriger)",
    r"strukturschwach|abwanderung|rueckbaugebiet": "Strukturschwacher Standort",
    r"milieuschutz|erhaltungssatzung": "Milieuschutz (Modernisierung eingeschränkt)",
}

# Harte Ausschlüsse: für eine 100%-Finanzierung praktisch nicht darstellbar
# oder rechtlich ungeeignet.
KNOCKOUT_SIGNALS: dict[str, str] = {
    r"erbbaurecht|erbpacht": "Erbbaurecht",
    r"niessbrauch|wohnrecht auf lebenszeit|lebenslanges wohnrecht": "Nießbrauch / lebenslanges Wohnrecht",
    r"teilverkauf|immobilien-teilverkauf": "Teilverkauf",
    r"zeitsharing|time-?sharing": "Timesharing",
    r"baugrundstueck ohne|reines grundstueck|nur grundstueck": "Grundstück ohne Bestand",
}


@dataclass
class Criterion:
    """Ein gewichtetes Kriterium mit Rampe von ``schlecht`` nach ``gut``."""

    weight: float
    schlecht: float
    gut: float
    pflicht: bool = False  # fehlt der Wert -> Kriterium als 0 werten statt zu ignorieren


@dataclass
class ScoringConfig:
    criteria: dict[str, Criterion] = field(default_factory=dict)

    # Harte Filter (K.o. bei Verletzung)
    min_cashflow_nach_steuer_monat: float | None = None
    max_faktor: float | None = None
    min_brutto_rendite: float | None = None
    min_dscr: float | None = None
    min_einheiten: int | None = None
    max_kaufpreis: float | None = None
    knockout_keywords_aktiv: bool = True

    bonus_pro_signal: float = 2.0
    bonus_max: float = 12.0
    malus_pro_risiko: float = 3.0
    malus_max: float = 15.0


DEFAULT_CRITERIA: dict[str, Criterion] = {
    # Der Cashflow nach Steuern ist bei 100 % Finanzierung die entscheidende
    # Größe: ohne Eigenkapital muss das Objekt sich selbst tragen.
    "cashflow": Criterion(weight=30, schlecht=-300, gut=400, pflicht=True),
    # Kaufpreisfaktor (Jahresmieten): klein ist gut.
    "faktor": Criterion(weight=20, schlecht=25, gut=13, pflicht=True),
    "brutto_rendite": Criterion(weight=15, schlecht=4.0, gut=9.0, pflicht=True),
    # Kapitaldienstdeckungsgrad – so prüft die Bank.
    "dscr": Criterion(weight=15, schlecht=0.9, gut=1.4, pflicht=True),
    # Mehrere Einheiten streuen das Mietausfallrisiko.
    "einheiten": Criterion(weight=8, schlecht=1, gut=6),
    # Günstiger Einstandspreis je m² schafft Puffer.
    "preis_pro_qm": Criterion(weight=7, schlecht=3000, gut=900),
    # Neuere Objekte = weniger Instandhaltungsrisiko (schwach gewichtet,
    # weil Altbau mit Sanierungspotenzial durchaus gewollt sein kann).
    "baujahr": Criterion(weight=5, schlecht=1930, gut=1995),
}


def find_signals(text: str, table: dict[str, str]) -> list[str]:
    norm = normalize(text)
    hits: list[str] = []
    for pattern, label in table.items():
        if re.search(pattern, norm) and label not in hits:
            hits.append(label)
    return hits


def score(listing: Listing, finance: Finance | None, config: ScoringConfig) -> Evaluation:
    subscores: dict[str, float] = {}
    reasons: list[str] = []
    knockouts: list[str] = []

    flags = find_signals(listing.text, OPPORTUNITY_SIGNALS)
    warnings = find_signals(listing.text, RISK_SIGNALS)
    if config.knockout_keywords_aktiv:
        knockouts.extend(find_signals(listing.text, KNOCKOUT_SIGNALS))

    if finance is None:
        reasons.append("Keine Bewertung möglich: Kaufpreis oder Miete unbekannt")
        return Evaluation(
            listing=listing, finance=None, score=0.0, subscores={},
            reasons=reasons, flags=flags, warnings=warnings, knockouts=knockouts,
        )

    cf_monat = finance.cf_nach_steuer_monat()

    # --- harte Filter -------------------------------------------------------
    if config.min_cashflow_nach_steuer_monat is not None and cf_monat < config.min_cashflow_nach_steuer_monat:
        knockouts.append(
            f"Cashflow n. St. {cf_monat:,.0f} €/Mon unter Minimum {config.min_cashflow_nach_steuer_monat:,.0f} €"
        )
    if config.max_faktor is not None and finance.faktor > config.max_faktor:
        knockouts.append(f"Kaufpreisfaktor {finance.faktor:.1f} über Maximum {config.max_faktor:.1f}")
    if config.min_brutto_rendite is not None and finance.brutto_rendite < config.min_brutto_rendite:
        knockouts.append(
            f"Bruttorendite {finance.brutto_rendite:.2f} % unter Minimum {config.min_brutto_rendite:.2f} %"
        )
    if config.min_dscr is not None and finance.dscr < config.min_dscr:
        knockouts.append(f"Kapitaldienstdeckung {finance.dscr:.2f} unter Minimum {config.min_dscr:.2f}")
    if config.min_einheiten is not None and (listing.units or 0) < config.min_einheiten:
        knockouts.append(f"Nur {listing.units or 0} Einheiten, gefordert sind {config.min_einheiten}")
    if config.max_kaufpreis is not None and finance.kaufpreis > config.max_kaufpreis:
        knockouts.append(f"Kaufpreis {finance.kaufpreis:,.0f} € über Budget {config.max_kaufpreis:,.0f} €")

    # --- gewichtete Kriterien ----------------------------------------------
    values: dict[str, float | None] = {
        "cashflow": cf_monat,
        "faktor": finance.faktor,
        "brutto_rendite": finance.brutto_rendite,
        "dscr": min(finance.dscr, 5.0),
        "einheiten": float(listing.units) if listing.units else None,
        "preis_pro_qm": listing.price_per_sqm,
        "baujahr": float(listing.year_built) if listing.year_built else None,
    }

    total_weight = 0.0
    weighted = 0.0
    for name, crit in config.criteria.items():
        value = values.get(name)
        if value is None:
            if crit.pflicht:
                total_weight += crit.weight  # fehlender Pflichtwert kostet Punkte
            continue
        sub = ramp(value, crit.schlecht, crit.gut)
        subscores[name] = sub
        weighted += sub * crit.weight
        total_weight += crit.weight

    base = (weighted / total_weight * 100.0) if total_weight else 0.0

    bonus = min(len(flags) * config.bonus_pro_signal, config.bonus_max)
    malus = min(len(warnings) * config.malus_pro_risiko, config.malus_max)
    final = max(0.0, min(100.0, base + bonus - malus))

    # --- Begründung ---------------------------------------------------------
    reasons.append(f"Cashflow n. St. {cf_monat:,.0f} €/Mon (v. St. {finance.cf_vor_steuer_monat():,.0f} €)")
    reasons.append(f"Faktor {finance.faktor:.1f} · Brutto {finance.brutto_rendite:.2f} % · Netto {finance.netto_rendite:.2f} %")
    reasons.append(f"Kapitaldienstdeckung {finance.dscr:.2f} · Darlehen {finance.darlehen:,.0f} €")
    if finance.miete_ist_geschaetzt:
        reasons.append("⚠ Miete geschätzt (Inserat nennt keine Ist-Miete) – vor Ort prüfen")

    return Evaluation(
        listing=listing, finance=finance, score=final, subscores=subscores,
        reasons=reasons, flags=flags, warnings=warnings, knockouts=knockouts,
    )
