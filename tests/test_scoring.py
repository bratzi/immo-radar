"""Tests der Bewertungs-Engine."""

import copy

from immosearch.finance import FinancingAssumptions, evaluate as evaluate_finance
from immosearch.models import Listing
from immosearch.scoring import DEFAULT_CRITERIA, ScoringConfig, ramp, score


def cfg(**overrides) -> ScoringConfig:
    base = ScoringConfig(criteria=copy.deepcopy(DEFAULT_CRITERIA))
    for key, value in overrides.items():
        setattr(base, key, value)
    return base


def objekt(**overrides) -> Listing:
    defaults = dict(
        source="test", source_id="1", url="http://x", title="MFH",
        description="", price=400_000, living_area=400, units=6,
        rent_year=36_000, state="NW", year_built=1975,
    )
    defaults.update(overrides)
    return Listing(**defaults)


def bewerte(listing, config=None, assumptions=None):
    assumptions = assumptions or FinancingAssumptions()
    return score(listing, evaluate_finance(listing, assumptions), config or cfg())


def test_ramp_in_beide_richtungen():
    assert ramp(5, 0, 10) == 0.5
    assert ramp(13, 25, 13) == 1.0   # kleiner ist besser
    assert ramp(12, 25, 13) == 1.0   # jenseits von "gut" gedeckelt
    assert ramp(30, 25, 13) == 0.0
    assert ramp(-100, -300, 400) < 0.5


def test_gutes_objekt_schlaegt_schlechtes():
    gut = bewerte(objekt(price=350_000, rent_year=38_000))
    schlecht = bewerte(objekt(price=850_000, rent_year=30_000))
    assert gut.score > schlecht.score


def test_knockout_keywords():
    result = bewerte(objekt(description="Verkauf im Erbbaurecht"))
    assert result.rejected
    assert "Erbbaurecht" in result.knockouts


def test_harte_filter_greifen():
    result = bewerte(objekt(price=900_000), cfg(min_cashflow_nach_steuer_monat=0))
    assert result.rejected
    assert any("Cashflow" in k for k in result.knockouts)

    result = bewerte(objekt(), cfg(max_faktor=5))
    assert any("Kaufpreisfaktor" in k for k in result.knockouts)

    result = bewerte(objekt(units=2), cfg(min_einheiten=3))
    assert any("Einheiten" in k for k in result.knockouts)


def test_chancen_signale_geben_bonus():
    neutral = bewerte(objekt())
    mit_signal = bewerte(objekt(
        description="Provisionsfrei, Verkauf aus einer Erbengemeinschaft, VB"
    ))
    assert mit_signal.score > neutral.score
    assert len(mit_signal.flags) >= 2


def test_risiken_geben_malus():
    neutral = bewerte(objekt())
    riskant = bewerte(objekt(description="Erheblicher Sanierungsstau, Asbest im Dach"))
    assert riskant.score < neutral.score
    assert len(riskant.warnings) >= 2


def test_bonus_und_malus_sind_gedeckelt():
    config = cfg(bonus_pro_signal=5, bonus_max=6, malus_pro_risiko=5, malus_max=6)
    viele_signale = bewerte(objekt(
        description="provisionsfrei von privat, Erbengemeinschaft, Zwangsversteigerung, "
                    "VB, Renovierungsbedarf, Leerstand, Kapitalanlage"
    ), config)
    ohne = bewerte(objekt(), config)
    assert viele_signale.score - ohne.score <= 6.001


def test_ohne_finanzdaten_score_null():
    result = score(objekt(price=None, rent_year=None), None, cfg())
    assert result.score == 0
    assert "Keine Bewertung möglich" in result.reasons[0]


def test_kriterium_mit_gewicht_null_ist_abgeschaltet():
    config = cfg()
    del config.criteria["baujahr"]
    result = bewerte(objekt(year_built=1900), config)
    assert "baujahr" not in result.subscores


def test_signalmuster_treffen_echte_umlaute():
    """Die Muster sind in Digraph-Schreibweise notiert – normalize() muss passen."""
    from immosearch.scoring import (
        KNOCKOUT_SIGNALS, OPPORTUNITY_SIGNALS, RISK_SIGNALS, find_signals,
    )

    assert "Nießbrauch / lebenslanges Wohnrecht" in find_signals(
        "Verkauf unter Nießbrauch", KNOCKOUT_SIGNALS
    )
    assert find_signals("Denkmalgeschütztes Objekt", RISK_SIGNALS)
    assert find_signals("Rückbaugebiet, strukturschwach", RISK_SIGNALS)
    assert find_signals("Günstig abzugeben, Preis gesenkt", OPPORTUNITY_SIGNALS)


def test_umlaute_in_der_extraktion():
    from immosearch.extract import extract_living_area, extract_land_area, extract_units

    assert extract_living_area("Wohnfläche: 512 m²") == 512
    assert extract_living_area("320 qm Wohnfläche") == 320
    assert extract_land_area("Grundstücksfläche 780 m²") == 780
    assert extract_units("Fünffamilienhaus") == 5
