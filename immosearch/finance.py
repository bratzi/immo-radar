"""Finanzierungs- und Renditemodell für die 100 %- bzw. 110 %-Finanzierung.

Die Rechnung folgt der Logik, mit der eine Bank ein vermietetes Objekt prüft:
Kaufpreis + Kaufnebenkosten ergeben die Gesamtinvestition, davon wird das
Darlehen abgeleitet, und entscheidend ist am Ende, ob die Nettomiete den
Kapitaldienst trägt (Cashflow / Kapitaldienstdeckungsgrad).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .models import Finance, Listing

# Grunderwerbsteuersätze in Prozent, Stand 2025. Die Sätze ändern sich
# landesweise – sie sind deshalb in der config.yaml überschreibbar.
GRUNDERWERBSTEUER: dict[str, float] = {
    "BW": 5.0, "BY": 3.5, "BE": 6.0, "BB": 6.5, "HB": 5.0, "HH": 5.5,
    "HE": 6.0, "MV": 6.0, "NI": 5.0, "NW": 6.5, "RP": 5.0, "SL": 6.5,
    "SN": 5.5, "ST": 5.0, "SH": 6.5, "TH": 5.0,
}
GRUNDERWERBSTEUER_DEFAULT = 5.5


@dataclass
class FinancingAssumptions:
    """Alle Annahmen der Finanzierung an einer Stelle – 1:1 aus der config.yaml."""

    # Finanzierungsart
    mode: str = "100"  # "100" = Kaufpreis finanziert, NK aus EK; "110" = alles finanziert
    eigenkapital: float = 0.0  # nur bei mode "custom" relevant

    # Konditionen
    zinssatz: float = 4.0  # Sollzins p.a. in %
    tilgung: float = 1.5  # anfängliche Tilgung p.a. in %
    zinsbindung_jahre: int = 10

    # Kaufnebenkosten in % des Kaufpreises
    grunderwerbsteuer: float | None = None  # None = aus Bundesland ableiten
    notar_prozent: float = 1.5
    grundbuch_prozent: float = 0.5
    makler_prozent: float = 3.57
    makler_bei_provisionsfrei: float = 0.0

    # Nicht umlagefähige Bewirtschaftungskosten
    verwaltung_pro_einheit_monat: float = 25.0
    instandhaltung_pro_qm_jahr: float = 10.0
    mietausfallwagnis_prozent: float = 3.0  # % der Jahreskaltmiete

    # Steuern
    grenzsteuersatz: float = 42.0  # in %
    gebaeudeanteil: float = 75.0  # % der Gesamtinvestition, Rest = Grund und Boden
    afa_satz: float = 2.0  # lineare AfA in %
    steuer_beruecksichtigen: bool = True

    # Mietschätzung, wenn das Inserat keine Miete nennt
    miete_schaetzen: bool = True
    markt_miete_pro_qm: float = 7.5  # €/m²/Monat, Fallback
    markt_miete_pro_plz: dict[str, float] = field(default_factory=dict)  # "44" oder "44135"

    def grunderwerbsteuer_fuer(self, state: str | None) -> float:
        if self.grunderwerbsteuer is not None:
            return self.grunderwerbsteuer
        if state and state in GRUNDERWERBSTEUER:
            return GRUNDERWERBSTEUER[state]
        return GRUNDERWERBSTEUER_DEFAULT

    def miete_pro_qm_fuer(self, zip_code: str | None) -> float:
        """Marktmiete €/m²/Monat: exakte PLZ vor PLZ-Präfix vor globalem Fallback."""
        if zip_code:
            for length in (5, 3, 2, 1):
                key = zip_code[:length]
                if key in self.markt_miete_pro_plz:
                    return float(self.markt_miete_pro_plz[key])
        return self.markt_miete_pro_qm


def kaufnebenkosten(
    kaufpreis: float,
    assumptions: FinancingAssumptions,
    state: str | None,
    commission_free: bool | None,
) -> tuple[float, float]:
    """(Betrag, Quote in %) der Kaufnebenkosten."""
    grest = assumptions.grunderwerbsteuer_fuer(state)
    makler = (
        assumptions.makler_bei_provisionsfrei
        if commission_free
        else assumptions.makler_prozent
    )
    quote = grest + assumptions.notar_prozent + assumptions.grundbuch_prozent + makler
    return kaufpreis * quote / 100.0, quote


def restschuld(darlehen: float, zins: float, annuitaet: float, jahre: float) -> float:
    """Restschuld nach ``jahre`` bei jährlicher Verrechnung (Näherung)."""
    if darlehen <= 0:
        return 0.0
    i = zins / 100.0
    if i <= 0:
        return max(0.0, darlehen - annuitaet * jahre)
    q = (1 + i) ** jahre
    rest = darlehen * q - annuitaet * (q - 1) / i
    return max(0.0, rest)


def laufzeit_jahre(darlehen: float, zins: float, annuitaet: float) -> float | None:
    """Jahre bis zur vollständigen Tilgung; None, wenn die Annuität den Zins nicht deckt."""
    import math

    if darlehen <= 0:
        return 0.0
    i = zins / 100.0
    if i <= 0:
        return darlehen / annuitaet if annuitaet > 0 else None
    if annuitaet <= darlehen * i:
        return None  # Annuität trägt nicht einmal die Zinsen
    return math.log(annuitaet / (annuitaet - darlehen * i)) / math.log(1 + i)


def schaetze_jahresmiete(
    listing: Listing, assumptions: FinancingAssumptions
) -> tuple[float | None, bool]:
    """(Jahreskaltmiete, geschätzt?) – Ist-Miete schlägt Schätzung immer."""
    ist = listing.effective_rent_year()
    if ist:
        return ist, False
    if not assumptions.miete_schaetzen:
        return None, False
    if listing.living_area:
        qm_miete = assumptions.miete_pro_qm_fuer(listing.zip_code)
        return listing.living_area * qm_miete * 12, True
    return None, False


def evaluate(listing: Listing, assumptions: FinancingAssumptions) -> Finance | None:
    """Vollständige Finanzierungsrechnung. None, wenn Preis oder Miete fehlen."""
    kaufpreis = listing.price
    if not kaufpreis or kaufpreis <= 0:
        return None

    jahresmiete, geschaetzt = schaetze_jahresmiete(listing, assumptions)
    if not jahresmiete or jahresmiete <= 0:
        return None

    nk, nk_quote = kaufnebenkosten(
        kaufpreis, assumptions, listing.state, listing.commission_free
    )
    gesamtinvestition = kaufpreis + nk

    if assumptions.mode == "110":
        eigenkapital = 0.0
    elif assumptions.mode == "100":
        eigenkapital = nk  # Nebenkosten aus Eigenkapital, Kaufpreis voll finanziert
    else:
        eigenkapital = max(0.0, assumptions.eigenkapital)
    darlehen = max(0.0, gesamtinvestition - eigenkapital)

    # Bewirtschaftung: nicht umlagefähige Kosten
    einheiten = listing.units or 1
    verwaltung = assumptions.verwaltung_pro_einheit_monat * 12 * einheiten
    flaeche = listing.living_area or (jahresmiete / 12 / max(assumptions.markt_miete_pro_qm, 1.0))
    instandhaltung = assumptions.instandhaltung_pro_qm_jahr * flaeche
    mietausfall = jahresmiete * assumptions.mietausfallwagnis_prozent / 100.0
    bewirtschaftung = verwaltung + instandhaltung + mietausfall
    noi = jahresmiete - bewirtschaftung

    annuitaet = darlehen * (assumptions.zinssatz + assumptions.tilgung) / 100.0
    zins_j1 = darlehen * assumptions.zinssatz / 100.0
    tilgung_j1 = annuitaet - zins_j1

    cashflow_vor_steuer = noi - annuitaet

    # Steuern: AfA und Zinsen mindern das zu versteuernde Ergebnis, die Tilgung nicht.
    afa = gesamtinvestition * assumptions.gebaeudeanteil / 100.0 * assumptions.afa_satz / 100.0
    steuerliches_ergebnis = jahresmiete - bewirtschaftung - zins_j1 - afa
    if assumptions.steuer_beruecksichtigen:
        steuereffekt = -steuerliches_ergebnis * assumptions.grenzsteuersatz / 100.0
    else:
        steuereffekt = 0.0
    cashflow_nach_steuer = cashflow_vor_steuer + steuereffekt

    faktor = kaufpreis / jahresmiete
    brutto_rendite = jahresmiete / kaufpreis * 100.0
    netto_rendite = noi / gesamtinvestition * 100.0
    dscr = noi / annuitaet if annuitaet > 0 else float("inf")

    return Finance(
        kaufpreis=kaufpreis,
        kaufnebenkosten=nk,
        nebenkosten_quote=nk_quote,
        gesamtinvestition=gesamtinvestition,
        eigenkapital=eigenkapital,
        darlehen=darlehen,
        beleihungsauslauf=darlehen / kaufpreis * 100.0,
        jahreskaltmiete=jahresmiete,
        miete_ist_geschaetzt=geschaetzt,
        bewirtschaftungskosten=bewirtschaftung,
        noi=noi,
        annuitaet=annuitaet,
        zins_j1=zins_j1,
        tilgung_j1=tilgung_j1,
        cashflow_vor_steuer=cashflow_vor_steuer,
        afa=afa,
        steuerliches_ergebnis=steuerliches_ergebnis,
        steuereffekt=steuereffekt,
        cashflow_nach_steuer=cashflow_nach_steuer,
        faktor=faktor,
        brutto_rendite=brutto_rendite,
        netto_rendite=netto_rendite,
        dscr=dscr,
        restschuld_nach_zinsbindung=restschuld(
            darlehen, assumptions.zinssatz, annuitaet, assumptions.zinsbindung_jahre
        ),
        jahre_bis_schuldenfrei=laufzeit_jahre(darlehen, assumptions.zinssatz, annuitaet),
    )
