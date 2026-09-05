"""RSS-/Atom-Quelle.

Viele kleine Portale, Maklerseiten und Suchagenten bieten Feeds an. Feeds sind
die freundlichste Form der Abfrage: sie sind zum Abonnieren gedacht, günstig
und stabil. Wo es einen Feed gibt, sollte er dem Scraper vorgezogen werden.
"""

from __future__ import annotations

import logging
from typing import Iterator
from xml.etree import ElementTree

from ..extract import enrich
from ..models import Listing
from ..util import clean_text
from .base import RobotsDisallowed, SearchQuery, Source

log = logging.getLogger(__name__)

_NS = {"atom": "http://www.w3.org/2005/Atom", "content": "http://purl.org/rss/1.0/modules/content/"}


class RssSource(Source):
    def __init__(self, client, config: dict) -> None:
        super().__init__(client, config)
        self.feed_url: str = config["feed_url"]
        self.ignore_robots: bool = config.get("ignore_robots", False)

    def search(self, query: SearchQuery) -> Iterator[Listing]:
        values = query.format_map()
        values.update({str(k): str(v) for k, v in self.config.get("defaults", {}).items()})
        try:
            url = self.feed_url.format(**values)
        except KeyError as exc:
            log.warning("[%s] Platzhalter %s in feed_url nicht gesetzt", self.id, exc)
            return

        try:
            response = self.client.get(url, ignore_robots=self.ignore_robots)
        except (RobotsDisallowed, RuntimeError) as exc:
            log.warning("[%s] %s", self.id, exc)
            return

        try:
            root = ElementTree.fromstring(response.content)
        except ElementTree.ParseError as exc:
            log.warning("[%s] Feed nicht parsebar: %s", self.id, exc)
            return

        entries = root.findall(".//item") or root.findall(".//atom:entry", _NS)
        for entry in entries:
            listing = self._parse_entry(entry)
            if listing:
                yield enrich(listing)

    def _parse_entry(self, entry) -> Listing | None:
        def text_of(*paths: str) -> str:
            for path in paths:
                node = entry.find(path, _NS) if ":" in path else entry.find(path)
                if node is not None:
                    if node.text:
                        return clean_text(node.text)
                    href = node.get("href")
                    if href:
                        return clean_text(href)
            return ""

        title = text_of("title", "atom:title")
        url = text_of("link", "atom:link", "guid")
        if not title or not url:
            return None

        description = text_of("description", "atom:summary", "content:encoded", "atom:content")
        return Listing(
            source=self.id,
            source_id=text_of("guid", "atom:id") or url,
            url=url,
            title=title,
            description=description,
            published_at=text_of("pubDate", "atom:published", "atom:updated") or None,
        )
