"""Tests des Finanzierungsmodells."""

import math

from immosearch.finance import (
    FinancingAssumptions, evaluate, kaufnebenkosten, laufzeit_jahre, restschuld,
)
from immosearch.models import Listing


def objekt(**overrides) -> Listing:
    defaults = dict(
        source="test", source_id="1", url="http://x", title="MFH",
        price=400_000, living_area=400, units=6, rent_year=36_000,
        state="NW", zip_code="44135",
    )
    defaults.update(overrides)
    return Listing(**defaults)


def test_kaufnebenkosten_nach_bundesland():
    a = FinancingAssumptions(notar_prozent=1.5, grundbuch_prozent=0.5, makler_prozent=3.57)
    nrw, quote_nrw = kaufnebenkosten(400_000, a, "NW", False)
    bayern, quote_by = kaufnebenkosten(400_000, a, "BY", False)
    assert quote_nrw == 6.5 + 1.5 + 0.5 + 3.57
    assert quote_by == 3.5 + 1.5 + 0.5 + 3.57
    assert nrw > bayern


def test_provisionsfrei_spart_courtage():
    a = FinancingAssumptions()
    mit, _ = kaufnebenkosten(400_000, a, "NW", False)
    ohne, _ = kaufnebenkosten(400_000, a, "NW", True)
    assert math.isclose(mit - ohne, 400_000 * 3.57 / 100)


def test_modus_100_finanziert_nur_den_kaufpreis():
    f = evaluate(objekt(), FinancingAssumptions(mode="100"))
    assert math.isclose(f.darlehen, f.kaufpreis)
    assert math.isclose(f.eigenkapital, f.kaufnebenkosten)


def test_modus_110_finanziert_alles():
    f = evaluate(objekt(), FinancingAssumptions(mode="110"))
    assert f.eigenkapital == 0
    assert math.isclose(f.darlehen, f.gesamtinvestition)
    assert f.beleihungsauslauf > 100


def test_kennzahlen():
    f = evaluate(objekt(), FinancingAssumptions(mode="100"))
    assert math.isclose(f.faktor, 400_000 / 36_000)
    assert math.isclose(f.brutto_rendite, 9.0)
    assert f.netto_rendite < f.brutto_rendite  # Nebenkosten und Bewirtschaftung drücken


def test_bewirtschaftungskosten_werden_abgezogen():
    a = FinancingAssumptions(
        verwaltung_pro_einheit_monat=25, instandhaltung_pro_qm_jahr=10,
        mietausfallwagnis_prozent=3,
    )
    f = evaluate(objekt(), a)
    erwartet = 25 * 12 * 6 + 10 * 400 + 36_000 * 0.03
    assert math.isclose(f.bewirtschaftungskosten, erwartet)
    assert math.isclose(f.noi, 36_000 - erwartet)


def test_hoeherer_zins_senkt_cashflow():
    guenstig = evaluate(objekt(), FinancingAssumptions(zinssatz=3.0))
    teuer = evaluate(objekt(), FinancingAssumptions(zinssatz=6.0))
    assert teuer.cashflow_vor_steuer < guenstig.cashflow_vor_steuer


def test_steuereffekt_bei_verlust_ist_erstattung():
    # Hoher Zins -> steuerlicher Verlust -> Steuererstattung -> CF n.St. > CF v.St.
    f = evaluate(objekt(price=900_000), FinancingAssumptions(zinssatz=6.0, mode="110"))
    assert f.steuerliches_ergebnis < 0
    assert f.steuereffekt > 0
    assert f.cashflow_nach_steuer > f.cashflow_vor_steuer


def test_restschuld_und_laufzeit_passen_zusammen():
    darlehen, zins = 400_000.0, 4.0
    annuitaet = darlehen * 0.055
    jahre = laufzeit_jahre(darlehen, zins, annuitaet)
    assert jahre is not None
    assert math.isclose(restschuld(darlehen, zins, annuitaet, jahre), 0.0, abs_tol=1.0)
    assert restschuld(darlehen, zins, annuitaet, 10) < darlehen


def test_annuitaet_unter_zinslast_tilgt_nie():
    assert laufzeit_jahre(400_000, 4.0, 400_000 * 0.03) is None


def test_miete_wird_nur_bei_bedarf_geschaetzt():
    a = FinancingAssumptions(miete_schaetzen=True, markt_miete_pro_qm=8.0)
    mit_ist_miete = evaluate(objekt(), a)
    assert mit_ist_miete.miete_ist_geschaetzt is False

    ohne = evaluate(objekt(rent_year=None, rent_month=None), a)
    assert ohne.miete_ist_geschaetzt is True
    assert math.isclose(ohne.jahreskaltmiete, 400 * 8.0 * 12)


def test_plz_spezifische_marktmiete_schlaegt_fallback():
    a = FinancingAssumptions(markt_miete_pro_qm=7.0, markt_miete_pro_plz={"44": 9.0})
    assert a.miete_pro_qm_fuer("44135") == 9.0
    assert a.miete_pro_qm_fuer("99999") == 7.0


def test_ohne_preis_keine_bewertung():
    assert evaluate(objekt(price=None), FinancingAssumptions()) is None
