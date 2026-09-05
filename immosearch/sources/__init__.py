"""Quellen-Registry: baut aus der sources.yaml konkrete Source-Objekte."""

from __future__ import annotations

import logging

from .base import HttpClient, SearchQuery, Source, dedupe
from .html_source import HtmlSource
from .kleinanzeigen import KleinanzeigenSource
from .rss_source import RssSource

log = logging.getLogger(__name__)

SOURCE_TYPES = {
    "html": HtmlSource,
    "rss": RssSource,
    "kleinanzeigen": KleinanzeigenSource,
}

__all__ = [
    "HttpClient", "SearchQuery", "Source", "dedupe",
    "HtmlSource", "RssSource", "KleinanzeigenSource",
    "SOURCE_TYPES", "build_sources",
]


def build_sources(
    definitions: list[dict],
    client: HttpClient,
    *,
    categories: set[str] | None = None,
    only: set[str] | None = None,
) -> list[Source]:
    """Quellen instanziieren.

    ``categories`` filtert nach Art der Quelle (z. B. nur "nische" und
    "kleinanzeigen"), ``only`` wählt einzelne IDs gezielt aus.
    """
    sources: list[Source] = []
    for definition in definitions:
        source_id = definition.get("id", "?")
        if not definition.get("enabled", True) and not (only and source_id in only):
            continue
        if only and source_id not in only:
            continue
        if categories and definition.get("category", "nische") not in categories:
            continue

        source_type = definition.get("type", "html")
        cls = SOURCE_TYPES.get(source_type)
        if cls is None:
            log.warning("Unbekannter Quellentyp %r bei %s", source_type, source_id)
            continue
        try:
            sources.append(cls(client, definition))
        except KeyError as exc:
            log.warning("Quelle %s unvollständig konfiguriert: fehlt %s", source_id, exc)
    return sources
