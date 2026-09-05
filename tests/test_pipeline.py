"""Integrationstest: vom Roh-Inserat bis zu Report und Datenbank."""

import tempfile
from pathlib import Path

from immosearch.cli import evaluate_listings
from immosearch.config import load_config
from immosearch.extract import enrich
from immosearch.models import Listing
from immosearch.report import write_html
from immosearch.storage import Store

PROJEKT = Path(__file__).resolve().parent.parent


def config():
    return load_config(PROJEKT / "config" / "config.example.yaml",
                       PROJEKT / "config" / "sources.yaml")


def rohinserate() -> list[Listing]:
    """Wie sie aus einer Trefferliste kommen: alles steckt im Freitext."""
    return [
        Listing(
            source="kleinanzeigen", source_id="a1", url="http://x/1",
            title="Mehrfamilienhaus mit 6 Wohneinheiten, provisionsfrei",
            description="Verkauf aus einer Erbengemeinschaft. Wohnfläche 420 m², "
                        "Baujahr 1974. Jahresnettokaltmiete 35.400 EUR. "
                        "Kaufpreis 395.000 EUR. 45879 Gelsenkirchen. VB.",
        ),
        Listing(
            source="nische", source_id="a2", url="http://x/2",
            title="Repräsentatives Dreifamilienhaus",
            description="Wohnfläche 240 m², Baujahr 1998, Kaufpreis 890.000 EUR. "
                        "Jahresnettokaltmiete 24.000 EUR. 80331 München. "
                        "Käufercourtage 3,57 %.",
        ),
        Listing(
            source="nische", source_id="a3", url="http://x/3",
            title="Zinshaus im Erbbaurecht",
            description="8 Wohneinheiten, 600 m², Kaufpreis 300.000 EUR, "
                        "Mieteinnahmen 4.000 € monatlich. 44135 Dortmund.",
        ),
    ]


def test_pipeline_von_rohtext_bis_datenbank():
    app = config()
    profil = app.profile("ruhrgebiet")
    profil.preis_max = 1_000_000  # damit München nicht am Preisfilter scheitert

    inserate = [enrich(listing) for listing in rohinserate()]
    ergebnisse = evaluate_listings(inserate, app, profil)
    nach_id = {e.listing.source_id: e for e in ergebnisse}

    # Extraktion hat aus dem Freitext alles gezogen
    gut = nach_id["a1"]
    assert gut.listing.price == 395_000
    assert gut.listing.units == 6
    assert gut.listing.rent_year == 35_400
    assert gut.listing.state == "NW"
    assert gut.listing.commission_free is True
    assert gut.finance is not None and not gut.finance.miete_ist_geschaetzt

    # Provisionsfrei senkt die Nebenkosten unter die des Vergleichsobjekts
    assert gut.finance.nebenkosten_quote < nach_id["a2"].finance.nebenkosten_quote

    # Erbbaurecht fliegt raus, obwohl die Zahlen exzellent wären
    erbbau = nach_id["a3"]
    assert erbbau.rejected and "Erbbaurecht" in erbbau.knockouts

    # München mit Faktor 37 reißt die harten Filter
    assert nach_id["a2"].rejected

    # Sortierung: nicht abgelehnte Objekte stehen oben
    assert ergebnisse[0].listing.source_id == "a1"

    # Speicher: erst neu, dann bekannt, Preissenkung wird erkannt
    with tempfile.TemporaryDirectory() as tmp:
        with Store(Path(tmp) / "test.db") as store:
            assert store.upsert(gut)["neu"] is True
            assert store.upsert(gut)["neu"] is False
            gut.listing.price = 360_000
            resultat = store.upsert(gut)
            assert resultat["preis_alt"] == 395_000 and resultat["preis_neu"] == 360_000
            assert [d["uid"] for d in store.price_drops()] == [gut.listing.uid]

        # HTML-Report entsteht und enthält das Objekt
        ziel = write_html([gut], Path(tmp) / "report.html", "test", app.financing)
        html = ziel.read_text(encoding="utf-8")
        assert "Mehrfamilienhaus mit 6 Wohneinheiten" in html
        assert "Erbengemeinschaft" in html  # Chancen-Signal als Tag


def test_ausschluss_keywords_aus_dem_profil_greifen():
    app = config()
    profil = app.profile("ruhrgebiet")
    profil.ausschluss_keywords = ["erbengemeinschaft"]
    ergebnisse = evaluate_listings([enrich(l) for l in rohinserate()], app, profil)
    assert "a1" not in {e.listing.source_id for e in ergebnisse}


def test_preisfilter_hat_puffer_aber_nicht_unbegrenzt():
    app = config()
    profil = app.profile("ruhrgebiet")
    profil.preis_min, profil.preis_max = 100_000, 400_000
    ids = {e.listing.source_id for e in evaluate_listings(
        [enrich(l) for l in rohinserate()], app, profil)}
    assert "a1" in ids       # 395.000 liegt im Rahmen
    assert "a2" not in ids   # 890.000 weit darüber
