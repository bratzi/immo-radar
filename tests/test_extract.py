"""Tests der Freitext-Extraktion."""

from immosearch.extract import (
    enrich, extract_commission_free, extract_living_area, extract_price,
    extract_rent, extract_units, extract_year_built,
)
from immosearch.models import Listing


def test_jahresmiete():
    assert extract_rent("Jahresnettokaltmiete: 32.400 EUR")[0] == 32_400
    assert extract_rent("Mieteinnahmen 28.800 € p.a.")[0] == 28_800
    assert extract_rent("Jahreskaltmiete beträgt 45.000,- Euro")[0] == 45_000


def test_monatsmiete():
    assert extract_rent("Die Kaltmiete beträgt 2.400 € monatlich")[1] == 2_400
    assert extract_rent("Mieteinnahmen: 1.850 EUR pro Monat")[1] == 1_850


def test_widerspruechliche_mieten_werden_verworfen():
    jahr, monat = extract_rent("Jahresmiete 36.000 EUR, Kaltmiete 500 € monatlich")
    assert jahr == 36_000
    assert monat is None  # 500*12 passt nicht zu 36.000


def test_einheiten_in_ziffern_und_worten():
    assert extract_units("Mehrfamilienhaus mit 8 Wohneinheiten") == 8
    assert extract_units("Vierfamilienhaus, gepflegt") == 4
    assert extract_units("5 Parteien, alle vermietet") == 5
    assert extract_units("Haus mit drei Wohnungen") == 3


def test_unplausible_einheiten_werden_ignoriert():
    assert extract_units("Baujahr 1999 Wohneinheiten") is None


def test_flaeche_und_baujahr():
    assert extract_living_area("Wohnfläche ca. 385,5 m²") == 385.5
    assert extract_living_area("320 qm Wohnfläche") == 320
    assert extract_year_built("Baujahr 1968") == 1968
    assert extract_year_built("BJ. 2005, gepflegt") == 2005


def test_provisionsfrei():
    assert extract_commission_free("Provisionsfrei für den Käufer") is True
    assert extract_commission_free("Käufercourtage 3,57 % inkl. MwSt.") is False
    assert extract_commission_free("Schönes Haus") is None


def test_preis_aus_text():
    assert extract_price("Kaufpreis: 349.000 EUR") == 349_000
    assert extract_price("Kaufpreis 1.250.000 €") == 1_250_000


def test_enrich_ergaenzt_nur_leere_felder():
    listing = Listing(
        source="k", source_id="1", url="u",
        title="6-Familienhaus in 44135 Dortmund, provisionsfrei",
        description="Wohnfläche 420 m², Baujahr 1975, Jahresnettokaltmiete 33.600 EUR",
        price=390_000,
    )
    enrich(listing)
    assert listing.price == 390_000  # bleibt unangetastet
    assert listing.units == 6
    assert listing.living_area == 420
    assert listing.year_built == 1975
    assert listing.rent_year == 33_600
    assert listing.zip_code == "44135"
    assert listing.state == "NW"
    assert listing.commission_free is True
