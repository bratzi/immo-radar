"""Konfiguration laden und in typisierte Objekte überführen."""

from __future__ import annotations

import copy
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .finance import FinancingAssumptions
from .scoring import Criterion, DEFAULT_CRITERIA, ScoringConfig
from .sources.base import SearchQuery

log = logging.getLogger(__name__)

PACKAGE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = PACKAGE_DIR.parent
DEFAULT_CONFIG = PROJECT_DIR / "config" / "config.yaml"
EXAMPLE_CONFIG = PROJECT_DIR / "config" / "config.example.yaml"
DEFAULT_SOURCES = PROJECT_DIR / "config" / "sources.yaml"


@dataclass
class NotifyConfig:
    console: bool = True
    html_report: str | None = "reports/immosearch.html"
    min_score: float = 60.0
    telegram_token: str | None = None
    telegram_chat_id: str | None = None
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_to: list[str] = field(default_factory=list)


@dataclass
class HttpConfig:
    user_agent: str = (
        "ImmoSearch/0.1 (privates Immobilien-Suchtool; Kontakt siehe config.yaml)"
    )
    delay_seconds: float = 2.5
    timeout: int = 25
    respect_robots: bool = True


@dataclass
class AppConfig:
    profiles: list[SearchQuery]
    financing: FinancingAssumptions
    scoring: ScoringConfig
    notify: NotifyConfig
    http: HttpConfig
    sources: list[dict[str, Any]]
    database: str = "immosearch.db"
    quellen_kategorien: list[str] = field(
        default_factory=lambda: ["nische", "kleinanzeigen", "zwangsversteigerung"]
    )

    def profile(self, name: str | None) -> SearchQuery:
        if name is None:
            return self.profiles[0]
        for profile in self.profiles:
            if profile.name == name:
                return profile
        raise KeyError(
            f"Suchprofil {name!r} nicht gefunden. Vorhanden: "
            + ", ".join(p.name for p in self.profiles)
        )


def _load_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def _build_profiles(raw: list[dict] | None) -> list[SearchQuery]:
    if not raw:
        return [SearchQuery(name="default")]
    profiles = []
    for entry in raw:
        known = {f for f in SearchQuery.__dataclass_fields__}
        kwargs = {k: v for k, v in entry.items() if k in known}
        kwargs["extra"] = {k: v for k, v in entry.items() if k not in known}
        profiles.append(SearchQuery(**kwargs))
    return profiles


def _build_scoring(raw: dict) -> ScoringConfig:
    criteria = copy.deepcopy(DEFAULT_CRITERIA)
    for name, values in (raw.get("kriterien") or {}).items():
        if not isinstance(values, dict):
            continue
        base = criteria.get(name)
        criteria[name] = Criterion(
            weight=float(values.get("gewicht", base.weight if base else 0)),
            schlecht=float(values.get("schlecht", base.schlecht if base else 0)),
            gut=float(values.get("gut", base.gut if base else 1)),
            pflicht=bool(values.get("pflicht", base.pflicht if base else False)),
        )
    # Kriterien mit Gewicht 0 fliegen raus – so lässt sich eines abschalten.
    criteria = {k: v for k, v in criteria.items() if v.weight > 0}

    filters = raw.get("harte_filter") or {}
    return ScoringConfig(
        criteria=criteria,
        min_cashflow_nach_steuer_monat=filters.get("min_cashflow_nach_steuer_monat"),
        max_faktor=filters.get("max_faktor"),
        min_brutto_rendite=filters.get("min_brutto_rendite"),
        min_dscr=filters.get("min_dscr"),
        min_einheiten=filters.get("min_einheiten"),
        max_kaufpreis=filters.get("max_kaufpreis"),
        knockout_keywords_aktiv=filters.get("knockout_keywords", True),
        bonus_pro_signal=float(raw.get("bonus_pro_signal", 2.0)),
        bonus_max=float(raw.get("bonus_max", 12.0)),
        malus_pro_risiko=float(raw.get("malus_pro_risiko", 3.0)),
        malus_max=float(raw.get("malus_max", 15.0)),
    )


def _build_dataclass(cls, raw: dict):
    known = set(cls.__dataclass_fields__)
    unknown = set(raw) - known
    if unknown:
        log.warning("Unbekannte Konfigurationsschlüssel in %s: %s", cls.__name__, ", ".join(sorted(unknown)))
    return cls(**{k: v for k, v in raw.items() if k in known})


def load_config(
    config_path: str | Path | None = None, sources_path: str | Path | None = None
) -> AppConfig:
    config_file = Path(config_path) if config_path else DEFAULT_CONFIG
    if not config_file.exists() and EXAMPLE_CONFIG.exists():
        log.warning("%s fehlt – nutze %s. Anlegen mit: immosearch init", config_file, EXAMPLE_CONFIG.name)
        config_file = EXAMPLE_CONFIG

    raw = _load_yaml(config_file)
    sources_file = Path(sources_path) if sources_path else DEFAULT_SOURCES
    sources_raw = _load_yaml(sources_file)

    return AppConfig(
        profiles=_build_profiles(raw.get("suchprofile")),
        financing=_build_dataclass(FinancingAssumptions, raw.get("finanzierung") or {}),
        scoring=_build_scoring(raw.get("bewertung") or {}),
        notify=_build_dataclass(NotifyConfig, raw.get("benachrichtigung") or {}),
        http=_build_dataclass(HttpConfig, raw.get("http") or {}),
        sources=sources_raw.get("quellen") or [],
        database=raw.get("datenbank", "immosearch.db"),
        quellen_kategorien=raw.get("quellen_kategorien")
        or ["nische", "kleinanzeigen", "zwangsversteigerung"],
    )
