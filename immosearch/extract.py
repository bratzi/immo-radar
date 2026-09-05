"""Kennzahlen aus deutschem Inserats-Freitext ziehen.

Gerade auf Nischenseiten und bei Kleinanzeigen stehen die relevanten Zahlen
(Mieteinnahmen, Wohneinheiten, Wohnfläche) nur im Fließtext. Die Regeln hier
sind bewusst konservativ: lieber None als eine falsche Zahl, weil eine
erfundene Miete die komplette Renditerechnung wertlos macht.
"""

from __future__ import annotations

import re

from .models import Listing
from .util import extract_zip, normalize, parse_number, parse_price, state_from_zip

# --- Miete ------------------------------------------------------------------

_RENT_YEAR_PATTERNS = [
    r"(?:jahres(?:netto)?(?:kalt)?miete|jahresmiete|jahreskaltmiete|jahresnettomiete)[^\d]{0,20}([\d.,\s]+)",
    r"(?:miet(?:einnahmen|ertrag|erloese?)|nettomieteinnahmen|ist-?miete)[^\d]{0,25}"
    r"([\d.,\s]+)\s*(?:eur|euro|€)?\s*(?:p\.?\s?a\.?|pro jahr|jaehrlich|/\s?jahr)",
    r"(?:miet(?:einnahmen|ertrag)|mieteinnahme)[^\d]{0,20}([\d.,\s]+)\s*(?:eur|euro|€)[^\w]{0,3}(?:p\.?\s?a\.?|jaehrlich)",
]

_RENT_MONTH_PATTERNS = [
    r"(?:monats(?:netto)?(?:kalt)?miete|monatsmiete|kaltmiete|nettokaltmiete|nettomiete)"
    r"[^\d]{0,20}([\d.,\s]+)\s*(?:eur|euro|€)?\s*(?:p\.?\s?m\.?|pro monat|monatlich|/\s?monat)?",
    r"(?:miet(?:einnahmen|ertrag)|mieteinnahme)[^\d]{0,25}([\d.,\s]+)\s*(?:eur|euro|€)?\s*"
    r"(?:p\.?\s?m\.?|pro monat|monatlich|/\s?monat)",
]


def extract_rent(text: str) -> tuple[float | None, float | None]:
    """(Jahreskaltmiete, Monatskaltmiete) – jeweils None, wenn nicht genannt."""
    norm = normalize(text)

    year = None
    for pattern in _RENT_YEAR_PATTERNS:
        match = re.search(pattern, norm)
        if match:
            value = parse_number(match.group(1))
            if value and 1_000 <= value <= 2_000_000:
                year = value
                break

    month = None
    for pattern in _RENT_MONTH_PATTERNS:
        match = re.search(pattern, norm)
        if match:
            value = parse_number(match.group(1))
            if value and 100 <= value <= 100_000:
                month = value
                break

    # Plausibilitaet: wenn beide da sind und grob zusammenpassen, Jahr behalten.
    if year and month and not (0.6 <= year / (month * 12) <= 1.6):
        # Widerspruch -> die jaehrliche Angabe ist in Exposes die verlaesslichere
        month = None
    return year, month


# --- Einheiten --------------------------------------------------------------

_UNIT_WORDS = {
    "zwei": 2, "drei": 3, "vier": 4, "fuenf": 5, "sechs": 6, "sieben": 7,
    "acht": 8, "neun": 9, "zehn": 10, "elf": 11, "zwoelf": 12,
}

_UNIT_PATTERNS = [
    r"(\d{1,2})\s*(?:wohn)?einheiten",
    r"(\d{1,2})\s*(?:wohnungen|parteien|mietparteien|wohnparteien)",
    r"(\d{1,2})\s*[- ]?(?:familien(?:haus|hauser|wohnhaus))",
    r"(\d{1,2})\s*x\s*(?:wohnung|einheit)",
]


def extract_units(text: str) -> int | None:
    norm = normalize(text)

    for pattern in _UNIT_PATTERNS:
        match = re.search(pattern, norm)
        if match:
            units = int(match.group(1))
            if 1 <= units <= 60:
                return units

    for word, value in _UNIT_WORDS.items():
        if re.search(rf"\b{word}\s*[- ]?familien(?:haus|wohnhaus)", norm):
            return value
        if re.search(rf"\b{word}\s+(?:wohneinheiten|wohnungen|parteien)", norm):
            return value

    if re.search(r"\b(zweifamilien|doppelhaus)", norm):
        return 2
    if re.search(r"\bmehrfamilien", norm):
        return None  # bekannt "mehrere", aber Anzahl unklar
    return None


# --- Flaechen, Zimmer, Baujahr ---------------------------------------------

def extract_living_area(text: str) -> float | None:
    norm = normalize(text)
    patterns = [
        r"wohnflaeche[^\d]{0,20}([\d.,]+)\s*(?:m2|m²|qm)",
        r"([\d.,]+)\s*(?:m2|m²|qm)\s*wohnflaeche",
        r"wohnfl\.?[^\d]{0,10}([\d.,]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, norm)
        if match:
            value = parse_number(match.group(1))
            if value and 20 <= value <= 20_000:
                return value
    return None


def extract_land_area(text: str) -> float | None:
    norm = normalize(text)
    patterns = [
        r"grundstuecks?(?:flaeche|groesse)?[^\d]{0,20}([\d.,]+)\s*(?:m2|m²|qm)",
        r"([\d.,]+)\s*(?:m2|m²|qm)\s*grundstueck",
    ]
    for pattern in patterns:
        match = re.search(pattern, norm)
        if match:
            value = parse_number(match.group(1))
            if value and 20 <= value <= 200_000:
                return value
    return None


def extract_rooms(text: str) -> float | None:
    norm = normalize(text)
    match = re.search(r"([\d]+(?:,5)?)\s*(?:zimmer|zi\.)", norm)
    if match:
        value = parse_number(match.group(1))
        if value and 1 <= value <= 60:
            return value
    return None


def extract_year_built(text: str) -> int | None:
    norm = normalize(text)
    match = re.search(r"(?:baujahr|bj\.?|erbaut(?:\s+im\s+jahr)?)[^\d]{0,10}(1[89]\d{2}|20[0-4]\d)", norm)
    if match:
        return int(match.group(1))
    return None


def extract_commission_free(text: str) -> bool | None:
    norm = normalize(text)
    if re.search(r"provisionsfrei|ohne (?:makler|provision|courtage)|keine (?:provision|courtage)|maklerfrei", norm):
        return True
    if re.search(r"provision|courtage|maklergebuehr", norm):
        return False
    return None


def extract_price(text: str) -> float | None:
    norm = normalize(text)
    patterns = [
        r"(?:kaufpreis|preis)[^\d]{0,20}([\d.,\s]+)\s*(?:eur|euro|€)",
        r"([\d.,\s]+)\s*(?:eur|euro|€)\s*(?:kaufpreis|vb|verhandlungsbasis)",
    ]
    for pattern in patterns:
        match = re.search(pattern, norm)
        if match:
            value = parse_price(match.group(1))
            if value and 10_000 <= value <= 100_000_000:
                return value
    return None


# --- Anreicherung ------------------------------------------------------------

def enrich(listing: Listing) -> Listing:
    """Fehlende Felder aus dem Freitext ergaenzen. Vorhandene bleiben unberührt."""
    text = listing.text

    if listing.price is None:
        listing.price = extract_price(text)
    if listing.living_area is None:
        listing.living_area = extract_living_area(text)
    if listing.land_area is None:
        listing.land_area = extract_land_area(text)
    if listing.rooms is None:
        listing.rooms = extract_rooms(text)
    if listing.units is None:
        listing.units = extract_units(text)
    if listing.year_built is None:
        listing.year_built = extract_year_built(text)
    if listing.commission_free is None:
        listing.commission_free = extract_commission_free(text)

    if listing.rent_year is None and listing.rent_month is None:
        listing.rent_year, listing.rent_month = extract_rent(text)

    if listing.zip_code is None:
        # Ort und Titel mitlesen: in Trefferlisten steht die PLZ meist nur dort.
        listing.zip_code = extract_zip(f"{text}\n{listing.city or ''}")
    if listing.state is None:
        listing.state = state_from_zip(listing.zip_code)

    return listing
