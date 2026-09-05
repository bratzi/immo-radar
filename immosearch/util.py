"""Hilfsfunktionen: deutsche Zahlenformate, PLZ→Bundesland, Textnormalisierung."""

from __future__ import annotations

import re
import unicodedata

# --- Zahlen -----------------------------------------------------------------

_NUM_RE = re.compile(r"(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d+))?")


def parse_number(text: str | None) -> float | None:
    """Liest eine deutsche Zahl ("1.234.567,89", "1 234", "85,5") als float.

    Gibt None zurück, wenn nichts Plausibles gefunden wird.
    """
    if not text:
        return None
    m = _NUM_RE.search(str(text).replace("\xa0", " "))
    if not m:
        return None
    whole = re.sub(r"[.\s]", "", m.group(1))
    frac = m.group(2) or "0"
    try:
        return float(f"{whole}.{frac}")
    except ValueError:
        return None


def parse_price(text: str | None) -> float | None:
    """Preis aus Freitext. Ignoriert 'VB', 'auf Anfrage', 'Preis auf Anfrage'."""
    if not text:
        return None
    lowered = str(text).lower()
    if "anfrage" in lowered or "auf anfrage" in lowered:
        return None
    value = parse_number(text)
    if value is None:
        return None
    # Werte wie "1,25 Mio" oder "1,2 Millionen"
    if re.search(r"\b(mio|million)", lowered) and value < 1000:
        value *= 1_000_000
    if value <= 0:
        return None
    return value


# Deutsche Transliteration: Umlaute werden zu Digraphen, nicht zum nackten
# Grundvokal. Dadurch trifft ein Muster wie "wohnflaeche" sowohl "Wohnfläche"
# als auch die in Inseraten häufige Schreibweise "Wohnflaeche".
_UMLAUTE = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss",
                          "Ä": "ae", "Ö": "oe", "Ü": "ue"})


def normalize(text: str | None) -> str:
    """Kleinschreibung mit deutscher Umlaut-Transliteration – für Keyword-Treffer."""
    if not text:
        return ""
    text = text.translate(_UMLAUTE)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text.lower()).strip()


def clean_text(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"[ \t\xa0]+", " ", text).strip()


# --- Geografie --------------------------------------------------------------

# Näherung: Bundesland anhand der ersten beiden PLZ-Ziffern. An Landesgrenzen
# nicht exakt (PLZ-Gebiete folgen der Post, nicht der Verwaltung) – deshalb
# lässt sich das Bundesland im Suchprofil explizit überschreiben.
_PLZ2_STATE = {
    "01": "SN", "02": "SN", "03": "BB", "04": "SN", "06": "ST", "07": "TH",
    "08": "SN", "09": "SN",
    "10": "BE", "12": "BE", "13": "BE", "14": "BB", "15": "BB", "16": "BB",
    "17": "MV", "18": "MV", "19": "MV",
    "20": "HH", "21": "NI", "22": "HH", "23": "SH", "24": "SH", "25": "SH",
    "26": "NI", "27": "NI", "28": "HB", "29": "NI",
    "30": "NI", "31": "NI", "32": "NW", "33": "NW", "34": "HE", "35": "HE",
    "36": "HE", "37": "NI", "38": "NI", "39": "ST",
    "40": "NW", "41": "NW", "42": "NW", "44": "NW", "45": "NW", "46": "NW",
    "47": "NW", "48": "NW", "49": "NI",
    "50": "NW", "51": "NW", "52": "NW", "53": "NW", "54": "RP", "55": "RP",
    "56": "RP", "57": "NW", "58": "NW", "59": "NW",
    "60": "HE", "61": "HE", "63": "HE", "64": "HE", "65": "HE", "66": "SL",
    "67": "RP", "68": "BW", "69": "BW",
    "70": "BW", "71": "BW", "72": "BW", "73": "BW", "74": "BW", "75": "BW",
    "76": "BW", "77": "BW", "78": "BW", "79": "BW",
    "80": "BY", "81": "BY", "82": "BY", "83": "BY", "84": "BY", "85": "BY",
    "86": "BY", "87": "BY", "88": "BW", "89": "BY",
    "90": "BY", "91": "BY", "92": "BY", "93": "BY", "94": "BY", "95": "BY",
    "96": "BY", "97": "BY", "98": "TH", "99": "TH",
}

BUNDESLAENDER = {
    "BW": "Baden-Württemberg", "BY": "Bayern", "BE": "Berlin",
    "BB": "Brandenburg", "HB": "Bremen", "HH": "Hamburg", "HE": "Hessen",
    "MV": "Mecklenburg-Vorpommern", "NI": "Niedersachsen",
    "NW": "Nordrhein-Westfalen", "RP": "Rheinland-Pfalz", "SL": "Saarland",
    "SN": "Sachsen", "ST": "Sachsen-Anhalt", "SH": "Schleswig-Holstein",
    "TH": "Thüringen",
}

_PLZ_RE = re.compile(r"\b(\d{5})\b")


def extract_zip(text: str | None) -> str | None:
    """Erste plausible fünfstellige PLZ aus einem Text."""
    if not text:
        return None
    for match in _PLZ_RE.finditer(text):
        plz = match.group(1)
        if plz[:2] in _PLZ2_STATE or plz.startswith("0"):
            return plz
    return None


def state_from_zip(plz: str | None) -> str | None:
    if not plz or len(plz) < 2:
        return None
    return _PLZ2_STATE.get(plz[:2])
