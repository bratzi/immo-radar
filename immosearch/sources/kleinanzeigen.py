"""Kleinanzeigen (ehemals eBay Kleinanzeigen).

Eigenes Modul statt generischem HTML-Scraper, weil das URL-Schema
Ort-IDs braucht und die Trefferliste ein festes Markup hat. Alle Selektoren
sind trotzdem in der sources.yaml überschreibbar, damit ein Redesign der
Seite ohne Code-Änderung repariert werden kann.

Kleinanzeigen ist für diese Strategie die interessanteste Quelle: dort
inserieren Privatverkäufer, Erbengemeinschaften und Kleinvermieter, die den
Marktpreis oft nicht ausreizen – das ist genau der Bereich unterhalb der
großen Portale.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Iterator

from bs4 import BeautifulSoup

from ..extract import enrich
from ..models import Listing
from ..util import clean_text, parse_price
from .base import RobotsDisallowed, SearchQuery, Source
from .html_source import select_value

log = logging.getLogger(__name__)

BASE = "https://www.kleinanzeigen.de"

# Kategorie-IDs von Kleinanzeigen. Falls sich eine ID ändert, lässt sie sich
# in der sources.yaml unter `categories` überschreiben.
CATEGORIES = {
    "haus_kaufen": ("s-haus-kaufen", "c208"),
    "wohnung_kaufen": ("s-wohnung-kaufen", "c196"),
    "grundstuecke": ("s-grundstuecke", "c209"),
    "immobilien": ("s-immobilien", "c195"),
}

DEFAULT_SELECTORS = {
    "item": "article.aditem",
    "id": "@data-adid",
    "url": "@data-href",
    "title": "a.ellipsis",
    "price": ".aditem-main--middle--price-shipping--price",
    "description": ".aditem-main--middle--description",
    "location": ".aditem-main--top--left",
    "published": ".aditem-main--top--right",
    "image": "img@src",
}


class KleinanzeigenSource(Source):
    id = "kleinanzeigen"
    name = "Kleinanzeigen"
    category = "kleinanzeigen"

    def __init__(self, client, config: dict | None = None) -> None:
        super().__init__(client, config)
        self.selectors = {**DEFAULT_SELECTORS, **(self.config.get("selectors") or {})}
        self.categories = {**CATEGORIES, **(self.config.get("categories") or {})}
        self.category_key = self.config.get("kategorie", "haus_kaufen")
        self.ignore_robots = self.config.get("ignore_robots", False)
        self.fetch_details = self.config.get("fetch_details", True)
        self.max_details = int(self.config.get("max_details", 20))

    # -- Ortsauflösung ------------------------------------------------------

    def resolve_location(self, ort: str) -> tuple[str | None, str | None]:
        """(location_id, angezeigter Name) über die Ort-Autocomplete-API."""
        if not ort:
            return None, None
        try:
            response = self.client.get(
                f"{BASE}/s-ort-empfehlungen.json",
                params={"query": ort},
                ignore_robots=True,  # JSON-Endpunkt der eigenen Suchmaske
            )
            data = response.json()
        except Exception as exc:  # Endpunkt kann sich ändern – dann ohne Ort suchen
            log.info("Ortsauflösung für %r fehlgeschlagen (%s) – suche bundesweit", ort, exc)
            return None, None

        candidates = data if isinstance(data, list) else data.get("localities") or data.get("data") or []
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            loc_id = candidate.get("id") or candidate.get("locationId")
            name = candidate.get("name") or candidate.get("label")
            if loc_id:
                return str(loc_id), name
        return None, None

    # -- URL-Aufbau ---------------------------------------------------------

    def build_urls(self, query: SearchQuery) -> list[str]:
        slug, cat_id = self.categories.get(self.category_key, CATEGORIES["haus_kaufen"])
        loc_id, _ = self.resolve_location(query.ort or query.plz)

        keyword = "-".join(query.keywords).lower() if query.keywords else ""
        keyword = re.sub(r"[^a-z0-9\-]+", "", keyword.replace(" ", "-"))

        price = ""
        if query.preis_min or query.preis_max:
            price = f"/preis:{query.preis_min or ''}:{query.preis_max or ''}"

        location_part = f"l{loc_id}r{query.umkreis_km}" if loc_id else ""
        suffix = f"k0{cat_id}{location_part}"

        urls = []
        for page in range(1, max(1, query.max_seiten) + 1):
            page_part = f"/seite:{page}" if page > 1 else ""
            keyword_part = f"/{keyword}" if keyword else ""
            urls.append(f"{BASE}/{slug}{page_part}{keyword_part}/anzeige:angebote{price}/{suffix}")
        return urls

    # -- Suche --------------------------------------------------------------

    def search(self, query: SearchQuery) -> Iterator[Listing]:
        detail_budget = self.max_details
        seen: set[str] = set()

        for url in self.build_urls(query):
            try:
                response = self.client.get(url, ignore_robots=self.ignore_robots)
            except RobotsDisallowed:
                log.warning("[kleinanzeigen] robots.txt verbietet %s – übersprungen", url)
                return
            except RuntimeError as exc:
                log.warning("[kleinanzeigen] %s", exc)
                continue

            soup = BeautifulSoup(response.text, "lxml")
            items = soup.select(self.selectors["item"])
            if not items:
                log.info("[kleinanzeigen] keine Treffer auf %s", url)
                continue

            for item in items:
                listing = self._parse_item(item)
                if listing is None or listing.uid in seen:
                    continue
                seen.add(listing.uid)

                if self.fetch_details and detail_budget > 0:
                    detail_budget -= 1
                    listing = self.fetch_detail(listing)
                yield enrich(listing)

    def _parse_item(self, item) -> Listing | None:
        ad_id = clean_text(item.get("data-adid"))
        href = item.get("data-href") or select_value(item, "a@href")
        url = self.absolute(href, BASE)
        title = select_value(item, self.selectors["title"])
        if not url or not title:
            return None

        location = select_value(item, self.selectors["location"]) or ""
        description = select_value(item, self.selectors["description"]) or ""

        return Listing(
            source=self.id,
            source_id=ad_id or url,
            url=url,
            title=title,
            description=f"{description}\n{location}".strip(),
            price=parse_price(select_value(item, self.selectors["price"])),
            city=re.sub(r"^\d{5}\s*", "", location).strip() or None,
            image_url=select_value(item, self.selectors["image"]),
            published_at=select_value(item, self.selectors["published"]),
            raw={"location_line": location},
        )

    def fetch_detail(self, listing: Listing) -> Listing:
        """Beschreibung und Attributliste der Anzeigenseite nachladen.

        Bei Kleinanzeigen stehen Wohnfläche, Zimmerzahl und – für uns
        entscheidend – Sätze wie "Mieteinnahmen 2.400 € monatlich" fast immer
        nur im Beschreibungstext.
        """
        try:
            response = self.client.get(listing.url, ignore_robots=self.ignore_robots)
        except (RobotsDisallowed, RuntimeError):
            return listing

        soup = BeautifulSoup(response.text, "lxml")

        description = select_value(soup, "#viewad-description-text")
        if description:
            listing.description = f"{listing.description}\n{description}".strip()

        # Attributliste ("Wohnfläche", "Zimmer", "Baujahr", ...)
        attributes: list[str] = []
        for row in soup.select("li.addetailslist--detail"):
            attributes.append(clean_text(row.get_text(" ", strip=True)))
        if attributes:
            listing.description += "\n" + "\n".join(attributes)

        locality = select_value(soup, "#viewad-locality")
        if locality:
            listing.description += f"\n{locality}"

        # Strukturierte Daten, falls vorhanden – zuverlässiger als Selektoren.
        for script in soup.select('script[type="application/ld+json"]'):
            try:
                data = json.loads(script.string or "{}")
            except (json.JSONDecodeError, TypeError):
                continue
            if isinstance(data, dict) and listing.price is None:
                offers = data.get("offers") or {}
                price = offers.get("price") if isinstance(offers, dict) else None
                if price:
                    listing.price = parse_price(str(price))
        return listing
