"""Tests der Quellen-Schicht (ohne Netzwerk)."""

from bs4 import BeautifulSoup

from immosearch.sources import build_sources
from immosearch.sources.base import SearchQuery, dedupe
from immosearch.sources.html_source import HtmlSource, select_value
from immosearch.models import Listing


class FakeClient:
    """HTTP-Client-Ersatz, der festes HTML zurückgibt."""

    def __init__(self, html: str) -> None:
        self.html = html
        self.calls: list[str] = []

    def get(self, url, params=None, ignore_robots=False, retries=3):
        self.calls.append(url)

        class Response:
            pass

        response = Response()
        response.text = self.html
        response.url = url
        response.status_code = 200
        return response


SEITE = """
<html><body>
<article class="listing">
  <a class="t" href="/objekt/1">6-Familienhaus, provisionsfrei</a>
  <span class="p">395.000 €</span>
  <span class="a">Wohnfläche 420 m²</span>
  <span class="c">44135 Dortmund</span>
</article>
<article class="listing">
  <a class="t" href="/objekt/2">Doppelhaushälfte</a>
  <span class="p">Preis auf Anfrage</span>
  <span class="c">45879 Gelsenkirchen</span>
</article>
</body></html>
"""

DEFINITION = {
    "id": "test", "name": "Test", "type": "html", "category": "nische",
    "base_url": "https://beispiel.test",
    "search_url": "https://beispiel.test/suche?ort={ort}&max={preis_max}",
    "pagination": {"param": "seite", "start": 1, "max_pages": 2},
    "selectors": {
        "item": "article.listing", "url": "a.t@href", "title": "a.t",
        "price": ".p", "living_area": ".a", "city": ".c",
    },
}


def test_select_value_text_und_attribut():
    soup = BeautifulSoup('<a class="t" href="/x">Titel</a>', "lxml")
    assert select_value(soup, "a.t") == "Titel"
    assert select_value(soup, "a.t@href") == "/x"
    assert select_value(soup, ".gibtsnicht") is None
    assert select_value(soup, None) is None


def test_url_template_und_pagination():
    source = HtmlSource(FakeClient(SEITE), DEFINITION)
    urls = source.urls_for(SearchQuery(ort="Dortmund", preis_max=600_000, max_seiten=2))
    assert urls[0] == "https://beispiel.test/suche?ort=Dortmund&max=600000"
    assert urls[1].endswith("&seite=2")


def test_fehlender_platzhalter_bricht_nicht():
    definition = dict(DEFINITION, search_url="https://beispiel.test/{gibtsnicht}")
    assert HtmlSource(FakeClient(SEITE), definition).urls_for(SearchQuery()) == []


def test_parsen_und_anreichern():
    source = HtmlSource(FakeClient(SEITE), DEFINITION)
    listings = list(source.search(SearchQuery(ort="Dortmund", preis_max=600_000, max_seiten=1)))

    assert len(listings) == 2
    erste = listings[0]
    assert erste.url == "https://beispiel.test/objekt/1"
    assert erste.price == 395_000
    assert erste.living_area == 420
    assert erste.units == 6            # aus dem Titel
    assert erste.commission_free is True
    assert erste.zip_code == "44135"
    assert erste.state == "NW"

    assert listings[1].price is None   # "Preis auf Anfrage"


def test_dedupe_haelt_reihenfolge():
    a = Listing(source="s", source_id="1", url="u1", title="A")
    b = Listing(source="s", source_id="2", url="u2", title="B")
    assert [l.title for l in dedupe([a, b, a])] == ["A", "B"]


def test_registry_filtert_nach_kategorie_und_id():
    definitionen = [
        dict(DEFINITION, id="nische1", category="nische"),
        dict(DEFINITION, id="gross1", category="gross"),
        dict(DEFINITION, id="aus", category="nische", enabled=False),
    ]
    client = FakeClient(SEITE)
    assert [s.id for s in build_sources(definitionen, client, categories={"nische"})] == ["nische1"]
    assert [s.id for s in build_sources(definitionen, client, only={"gross1"})] == ["gross1"]
    # Eine gezielt angeforderte Quelle wird auch trotz enabled:false gebaut
    assert [s.id for s in build_sources(definitionen, client, only={"aus"})] == ["aus"]


def test_unvollstaendige_quelle_wird_uebersprungen():
    kaputt = {"id": "kaputt", "type": "html"}  # base_url/search_url fehlen
    assert build_sources([kaputt], FakeClient(SEITE)) == []
