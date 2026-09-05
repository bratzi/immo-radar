"""Generischer, konfigurationsgetriebener HTML-Scraper.

Die meisten Nischenportale unterscheiden sich nur in URL-Schema und
CSS-Selektoren. Statt für jedes ein eigenes Modul zu schreiben, wird eine
Quelle in der sources.yaml beschrieben – ändert ein Portal sein Markup,
reicht eine Anpassung der Selektoren.

Selektor-Syntax
---------------
``div.price``            Textinhalt des ersten Treffers
``a.title@href``         Attributwert
``div.meta li:nth-of-type(2)``  beliebige CSS-Selektoren (via soupsieve)
"""

from __future__ import annotations

import logging
from typing import Iterator

from bs4 import BeautifulSoup

from ..extract import enrich
from ..models import Listing
from ..util import clean_text, parse_number, parse_price
from .base import RobotsDisallowed, SearchQuery, Source

log = logging.getLogger(__name__)


def select_value(node, selector: str | None) -> str | None:
    """Wert nach der Selektor-Syntax auslesen; None, wenn nichts passt."""
    if not selector:
        return None
    attr = None
    if "@" in selector:
        selector, attr = selector.rsplit("@", 1)
    selector = selector.strip()
    try:
        found = node.select_one(selector) if selector else node
    except Exception:  # ungültiger Selektor in der Konfiguration
        log.debug("Ungültiger Selektor: %s", selector)
        return None
    if found is None:
        return None
    if attr:
        value = found.get(attr)
        if isinstance(value, list):
            value = " ".join(value)
        return clean_text(value)
    return clean_text(found.get_text(" ", strip=True))


class HtmlSource(Source):
    """Quelle, die vollständig aus der sources.yaml beschrieben wird."""

    def __init__(self, client, config: dict) -> None:
        super().__init__(client, config)
        self.base_url: str = config["base_url"]
        self.search_url: str = config["search_url"]
        self.selectors: dict = config.get("selectors", {})
        self.detail_selectors: dict = config.get("detail_selectors", {})
        self.fetch_details: bool = config.get("fetch_details", False)
        self.pagination: dict = config.get("pagination", {})
        self.ignore_robots: bool = config.get("ignore_robots", False)
        self.max_details: int = config.get("max_details", 15)

    # -- URL-Aufbau ---------------------------------------------------------

    def urls_for(self, query: SearchQuery) -> list[str]:
        values = query.format_map()
        values.update({str(k): str(v) for k, v in self.config.get("defaults", {}).items()})
        try:
            first = self.search_url.format(**values)
        except KeyError as exc:
            log.warning("[%s] Platzhalter %s in search_url nicht gesetzt", self.id, exc)
            return []

        urls = [first]
        param = self.pagination.get("param")
        if param:
            start = int(self.pagination.get("start", 1))
            pages = min(int(self.pagination.get("max_pages", 3)), query.max_seiten)
            template = self.pagination.get("template", "{url}{sep}{param}={page}")
            for page in range(start + 1, start + pages):
                sep = "&" if "?" in first else "?"
                urls.append(template.format(url=first, sep=sep, param=param, page=page))
        return urls

    # -- Suche --------------------------------------------------------------

    def search(self, query: SearchQuery) -> Iterator[Listing]:
        item_selector = self.selectors.get("item")
        if not item_selector:
            log.warning("[%s] kein item-Selektor konfiguriert", self.id)
            return

        seen_urls: set[str] = set()
        detail_budget = self.max_details

        for url in self.urls_for(query):
            try:
                response = self.client.get(url, ignore_robots=self.ignore_robots)
            except RobotsDisallowed:
                log.warning("[%s] robots.txt verbietet %s – übersprungen", self.id, url)
                return
            except RuntimeError as exc:
                log.warning("[%s] %s", self.id, exc)
                continue

            soup = BeautifulSoup(response.text, "lxml")
            items = soup.select(item_selector)
            if not items:
                log.info("[%s] keine Treffer auf %s (Selektor prüfen: 'immosearch doctor')", self.id, url)
                continue

            for item in items:
                listing = self._parse_item(item, response.url)
                if listing is None or listing.url in seen_urls:
                    continue
                seen_urls.add(listing.url)

                if self.fetch_details and detail_budget > 0:
                    detail_budget -= 1
                    listing = self.fetch_detail(listing)

                yield enrich(listing)

    def _parse_item(self, item, page_url: str) -> Listing | None:
        href = select_value(item, self.selectors.get("url"))
        url = self.absolute(href, page_url)
        title = select_value(item, self.selectors.get("title")) or ""
        if not url or not title:
            return None

        source_id = select_value(item, self.selectors.get("id")) or url

        return Listing(
            source=self.id,
            source_id=source_id,
            url=url,
            title=title,
            description=select_value(item, self.selectors.get("description")) or "",
            price=parse_price(select_value(item, self.selectors.get("price"))),
            living_area=parse_number(select_value(item, self.selectors.get("living_area"))),
            land_area=parse_number(select_value(item, self.selectors.get("land_area"))),
            rooms=parse_number(select_value(item, self.selectors.get("rooms"))),
            city=select_value(item, self.selectors.get("city")),
            image_url=self.absolute(select_value(item, self.selectors.get("image")), page_url),
            published_at=select_value(item, self.selectors.get("published")),
            raw={"page": page_url},
        )

    # -- Detailseite --------------------------------------------------------

    def fetch_detail(self, listing: Listing) -> Listing:
        if not self.detail_selectors:
            return listing
        try:
            response = self.client.get(listing.url, ignore_robots=self.ignore_robots)
        except (RobotsDisallowed, RuntimeError) as exc:
            log.debug("[%s] Detailseite nicht abrufbar: %s", self.id, exc)
            return listing

        soup = BeautifulSoup(response.text, "lxml")
        description = select_value(soup, self.detail_selectors.get("description"))
        if description:
            listing.description = f"{listing.description}\n{description}".strip()

        for field_name, parser in (
            ("price", parse_price),
            ("living_area", parse_number),
            ("land_area", parse_number),
            ("rooms", parse_number),
        ):
            if getattr(listing, field_name) is None:
                value = parser(select_value(soup, self.detail_selectors.get(field_name)))
                if value is not None:
                    setattr(listing, field_name, value)

        rent = select_value(soup, self.detail_selectors.get("rent_year"))
        if rent and listing.rent_year is None:
            listing.rent_year = parse_number(rent)

        # Häufig steht die volle Adresse nur im Detail-Markup.
        for key in ("address", "city"):
            value = select_value(soup, self.detail_selectors.get(key))
            if value:
                listing.description += f"\n{value}"
                if key == "city" and not listing.city:
                    listing.city = value
        return listing
