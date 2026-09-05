"""Datenmodelle: normalisiertes Inserat und Bewertungsergebnis."""

from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class Listing:
    """Ein Inserat, quellenunabhängig normalisiert.

    Alle Geldbeträge in EUR, Flächen in m². ``None`` heißt "nicht bekannt" –
    das ist bewusst von 0 unterschieden, weil die Bewertung fehlende Angaben
    anders behandelt als schlechte Werte.
    """

    source: str
    source_id: str
    url: str
    title: str
    description: str = ""

    price: float | None = None
    living_area: float | None = None
    land_area: float | None = None
    rooms: float | None = None
    units: int | None = None
    year_built: int | None = None

    zip_code: str | None = None
    city: str | None = None
    state: str | None = None  # Bundesland-Kürzel, z.B. "NW"

    rent_year: float | None = None  # Ist-Jahresnettokaltmiete
    rent_month: float | None = None  # Ist-Nettokaltmiete pro Monat

    commission_free: bool | None = None
    property_type: str | None = None
    published_at: str | None = None
    image_url: str | None = None

    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def uid(self) -> str:
        """Stabile ID über Quelle + Anzeigen-ID (Fallback: URL)."""
        key = f"{self.source}:{self.source_id or self.url}"
        return hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]

    @property
    def text(self) -> str:
        return f"{self.title}\n{self.description}"

    @property
    def price_per_sqm(self) -> float | None:
        if self.price and self.living_area:
            return self.price / self.living_area
        return None

    def effective_rent_year(self) -> float | None:
        """Ist-Jahreskaltmiete, egal ob monatlich oder jährlich inseriert."""
        if self.rent_year:
            return self.rent_year
        if self.rent_month:
            return self.rent_month * 12
        return None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["uid"] = self.uid
        return d


@dataclass
class Finance:
    """Ergebnis des Finanzierungsmodells (Jahr 1, sofern nicht anders benannt)."""

    kaufpreis: float
    kaufnebenkosten: float
    nebenkosten_quote: float
    gesamtinvestition: float
    eigenkapital: float
    darlehen: float
    beleihungsauslauf: float  # Darlehen / Kaufpreis

    jahreskaltmiete: float
    miete_ist_geschaetzt: bool
    bewirtschaftungskosten: float
    noi: float  # Nettomietertrag vor Kapitaldienst

    annuitaet: float
    zins_j1: float
    tilgung_j1: float

    cashflow_vor_steuer: float
    afa: float
    steuerliches_ergebnis: float
    steuereffekt: float  # positiv = Erstattung, negativ = Zahllast
    cashflow_nach_steuer: float

    faktor: float  # Kaufpreis / Jahreskaltmiete
    brutto_rendite: float
    netto_rendite: float
    dscr: float
    restschuld_nach_zinsbindung: float
    jahre_bis_schuldenfrei: float | None

    def cf_vor_steuer_monat(self) -> float:
        return self.cashflow_vor_steuer / 12

    def cf_nach_steuer_monat(self) -> float:
        return self.cashflow_nach_steuer / 12


@dataclass
class Evaluation:
    """Bewertetes Inserat: Kennzahlen + Score + Auffälligkeiten."""

    listing: Listing
    finance: Finance | None
    score: float  # 0..100
    subscores: dict[str, float] = field(default_factory=dict)
    reasons: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)  # positive Signale
    warnings: list[str] = field(default_factory=list)  # Risiken
    knockouts: list[str] = field(default_factory=list)  # harte Ausschlüsse

    @property
    def rejected(self) -> bool:
        return bool(self.knockouts)
