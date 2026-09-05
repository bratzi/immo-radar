"""Basis für alle Quellen: HTTP-Client mit robots.txt, Rate-Limit und Retries.

Wir scrapen fremde Seiten – deshalb ist hier defensiv gebaut:
robots.txt wird standardmäßig respektiert, pro Host gilt eine Mindestpause,
und der User-Agent ist ehrlich gesetzt. Wer eine Quelle anders behandeln will,
muss das in der sources.yaml explizit tun (``ignore_robots: true``).
"""

from __future__ import annotations

import logging
import random
import threading
import time
import urllib.robotparser
from dataclasses import dataclass, field
from typing import Iterable, Iterator
from urllib.parse import urljoin, urlparse

import requests

from ..models import Listing

log = logging.getLogger(__name__)

DEFAULT_USER_AGENT = (
    "ImmoSearch/0.1 (privates Immobilien-Suchtool; Kontakt siehe config.yaml)"
)


class RobotsDisallowed(RuntimeError):
    """Die robots.txt der Quelle verbietet den Abruf dieser URL."""


@dataclass
class SearchQuery:
    """Ein Suchprofil, wie es an alle Quellen übergeben wird."""

    name: str = "default"
    ort: str = ""
    plz: str = ""
    umkreis_km: int = 50
    preis_min: int = 0
    preis_max: int = 1_000_000
    min_einheiten: int = 0
    objekttypen: list[str] = field(default_factory=lambda: ["mehrfamilienhaus"])
    keywords: list[str] = field(default_factory=list)
    ausschluss_keywords: list[str] = field(default_factory=list)
    max_seiten: int = 3
    bundesland: str | None = None
    extra: dict = field(default_factory=dict)

    def format_map(self) -> dict[str, str]:
        """Platzhalter für URL-Templates in der sources.yaml."""
        return {
            "ort": self.ort,
            "ort_slug": self.ort.lower().replace(" ", "-").replace("ü", "ue")
            .replace("ö", "oe").replace("ä", "ae").replace("ß", "ss"),
            "plz": self.plz,
            "umkreis": str(self.umkreis_km),
            "preis_min": str(self.preis_min),
            "preis_max": str(self.preis_max),
            "keywords": "+".join(self.keywords),
            "keywords_space": " ".join(self.keywords),
        }


class HttpClient:
    """Gemeinsamer HTTP-Client für alle Quellen."""

    def __init__(
        self,
        user_agent: str = DEFAULT_USER_AGENT,
        delay_seconds: float = 2.0,
        timeout: int = 25,
        respect_robots: bool = True,
        proxies: dict[str, str] | None = None,
    ) -> None:
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": user_agent,
                "Accept-Language": "de-DE,de;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }
        )
        if proxies:
            self.session.proxies.update(proxies)
        self.delay_seconds = delay_seconds
        self.timeout = timeout
        self.respect_robots = respect_robots
        self._last_request: dict[str, float] = {}
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self._lock = threading.Lock()

    # -- robots.txt ---------------------------------------------------------

    def _robots_for(self, url: str) -> urllib.robotparser.RobotFileParser | None:
        parsed = urlparse(url)
        host = f"{parsed.scheme}://{parsed.netloc}"
        if host in self._robots:
            return self._robots[host]
        parser = urllib.robotparser.RobotFileParser()
        try:
            response = self.session.get(urljoin(host, "/robots.txt"), timeout=self.timeout)
            if response.status_code == 200:
                parser.parse(response.text.splitlines())
            else:
                parser = None  # keine robots.txt -> nicht verboten
        except requests.RequestException:
            parser = None
        self._robots[host] = parser
        return parser

    def allowed(self, url: str) -> bool:
        if not self.respect_robots:
            return True
        parser = self._robots_for(url)
        if parser is None:
            return True
        return parser.can_fetch(self.session.headers.get("User-Agent", "*"), url)

    # -- Abruf --------------------------------------------------------------

    def _throttle(self, url: str) -> None:
        host = urlparse(url).netloc
        with self._lock:
            last = self._last_request.get(host, 0.0)
            wait = self.delay_seconds + random.uniform(0, self.delay_seconds * 0.4)
            elapsed = time.monotonic() - last
            if elapsed < wait:
                time.sleep(wait - elapsed)
            self._last_request[host] = time.monotonic()

    def get(
        self,
        url: str,
        *,
        params: dict | None = None,
        ignore_robots: bool = False,
        retries: int = 3,
    ) -> requests.Response:
        if not ignore_robots and not self.allowed(url):
            raise RobotsDisallowed(url)
        last_error: Exception | None = None
        for attempt in range(retries):
            self._throttle(url)
            try:
                response = self.session.get(url, params=params, timeout=self.timeout)
                if response.status_code in (429, 503):
                    backoff = 2 ** attempt * 5
                    log.warning("%s antwortet %s – warte %ss", url, response.status_code, backoff)
                    time.sleep(backoff)
                    continue
                response.raise_for_status()
                return response
            except requests.RequestException as exc:
                last_error = exc
                time.sleep(2 ** attempt)
        raise RuntimeError(f"Abruf fehlgeschlagen: {url}") from last_error


class Source:
    """Basisklasse einer Quelle."""

    id: str = "base"
    name: str = "Basis"
    category: str = "nische"  # "nische" | "kleinanzeigen" | "gross" | "zwangsversteigerung"

    def __init__(self, client: HttpClient, config: dict | None = None) -> None:
        self.client = client
        self.config = config or {}
        self.id = self.config.get("id", self.id)
        self.name = self.config.get("name", self.name)
        self.category = self.config.get("category", self.category)

    def search(self, query: SearchQuery) -> Iterator[Listing]:  # pragma: no cover
        raise NotImplementedError

    def fetch_detail(self, listing: Listing) -> Listing:
        """Optional: Detailseite nachladen und Beschreibung ergänzen."""
        return listing

    # Hilfen für Unterklassen
    def absolute(self, href: str | None, base: str) -> str | None:
        if not href:
            return None
        return urljoin(base, href)


def dedupe(listings: Iterable[Listing]) -> list[Listing]:
    """Doppelte Inserate (gleiche uid) entfernen, Reihenfolge erhalten."""
    seen: set[str] = set()
    result: list[Listing] = []
    for listing in listings:
        if listing.uid in seen:
            continue
        seen.add(listing.uid)
        result.append(listing)
    return result
