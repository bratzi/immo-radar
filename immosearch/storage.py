"""SQLite-Speicher: Dublettenerkennung, Historie, Preisänderungen.

Der Nutzen liegt weniger im Archivieren als im Erkennen von Bewegung:
Ein Objekt, das seit acht Wochen inseriert ist und zweimal im Preis gesenkt
wurde, ist der bessere Verhandlungspartner als ein frisches Inserat.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .models import Evaluation, Listing

SCHEMA = """
CREATE TABLE IF NOT EXISTS listings (
    uid TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_id TEXT,
    url TEXT NOT NULL,
    title TEXT,
    price REAL,
    first_price REAL,
    living_area REAL,
    units INTEGER,
    city TEXT,
    zip_code TEXT,
    state TEXT,
    rent_year REAL,
    score REAL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    times_seen INTEGER DEFAULT 1,
    notified INTEGER DEFAULT 0,
    data TEXT
);
CREATE INDEX IF NOT EXISTS idx_listings_score ON listings(score DESC);
CREATE INDEX IF NOT EXISTS idx_listings_seen ON listings(last_seen DESC);

CREATE TABLE IF NOT EXISTS price_history (
    uid TEXT NOT NULL,
    price REAL,
    seen_at TEXT NOT NULL,
    PRIMARY KEY (uid, seen_at)
);

CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT,
    finished_at TEXT,
    profile TEXT,
    found INTEGER,
    new INTEGER
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: str | Path = "immosearch.db") -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "Store":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()

    # -- Schreiben -----------------------------------------------------------

    def upsert(self, evaluation: Evaluation) -> dict:
        """Inserat speichern/aktualisieren.

        Rückgabe beschreibt, was passiert ist:
        ``{"neu": bool, "preis_alt": float|None, "preis_neu": float|None}``
        """
        listing = evaluation.listing
        now = _now()
        existing = self.conn.execute(
            "SELECT uid, price, first_price, times_seen FROM listings WHERE uid = ?",
            (listing.uid,),
        ).fetchone()

        payload = json.dumps(
            {
                "listing": listing.to_dict(),
                "score": evaluation.score,
                "flags": evaluation.flags,
                "warnings": evaluation.warnings,
                "knockouts": evaluation.knockouts,
                "reasons": evaluation.reasons,
                "finance": evaluation.finance.__dict__ if evaluation.finance else None,
            },
            ensure_ascii=False,
            default=str,
        )

        if existing is None:
            self.conn.execute(
                """INSERT INTO listings (uid, source, source_id, url, title, price,
                       first_price, living_area, units, city, zip_code, state,
                       rent_year, score, first_seen, last_seen, times_seen, data)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)""",
                (
                    listing.uid, listing.source, listing.source_id, listing.url,
                    listing.title, listing.price, listing.price, listing.living_area,
                    listing.units, listing.city, listing.zip_code, listing.state,
                    listing.effective_rent_year(), evaluation.score, now, now, payload,
                ),
            )
            result = {"neu": True, "preis_alt": None, "preis_neu": listing.price}
        else:
            self.conn.execute(
                """UPDATE listings SET price = ?, living_area = ?, units = ?, city = ?,
                       zip_code = ?, state = ?, rent_year = ?, score = ?, last_seen = ?,
                       times_seen = times_seen + 1, data = ?
                   WHERE uid = ?""",
                (
                    listing.price, listing.living_area, listing.units, listing.city,
                    listing.zip_code, listing.state, listing.effective_rent_year(),
                    evaluation.score, now, payload, listing.uid,
                ),
            )
            alt = existing["price"]
            geaendert = (
                listing.price is not None and alt is not None and abs(listing.price - alt) > 1
            )
            result = {
                "neu": False,
                "preis_alt": alt if geaendert else None,
                "preis_neu": listing.price if geaendert else None,
            }

        if listing.price is not None:
            self.conn.execute(
                "INSERT OR REPLACE INTO price_history (uid, price, seen_at) VALUES (?,?,?)",
                (listing.uid, listing.price, now),
            )
        self.conn.commit()
        return result

    def mark_notified(self, uids: list[str]) -> None:
        self.conn.executemany(
            "UPDATE listings SET notified = 1 WHERE uid = ?", [(uid,) for uid in uids]
        )
        self.conn.commit()

    def log_run(self, profile: str, started: str, found: int, new: int) -> None:
        self.conn.execute(
            "INSERT INTO runs (started_at, finished_at, profile, found, new) VALUES (?,?,?,?,?)",
            (started, _now(), profile, found, new),
        )
        self.conn.commit()

    # -- Lesen ---------------------------------------------------------------

    def top(self, limit: int = 25, min_score: float = 0.0) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM listings WHERE score >= ? ORDER BY score DESC LIMIT ?",
            (min_score, limit),
        ).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def unnotified(self, min_score: float = 0.0) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM listings WHERE notified = 0 AND score >= ? ORDER BY score DESC",
            (min_score,),
        ).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def price_drops(self, min_percent: float = 3.0) -> list[dict]:
        """Objekte, deren Preis seit dem Ersterfassen gesunken ist."""
        rows = self.conn.execute(
            """SELECT * FROM listings
               WHERE first_price IS NOT NULL AND price IS NOT NULL
                 AND price < first_price * (1 - ?/100.0)
               ORDER BY (first_price - price) / first_price DESC""",
            (min_percent,),
        ).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def stale(self, days: int = 45) -> list[dict]:
        """Länger inserierte Objekte – erfahrungsgemäß verhandlungsbereiter."""
        rows = self.conn.execute(
            "SELECT * FROM listings WHERE julianday('now') - julianday(first_seen) >= ? "
            "ORDER BY first_seen ASC",
            (days,),
        ).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def get(self, uid: str) -> dict | None:
        row = self.conn.execute("SELECT * FROM listings WHERE uid = ?", (uid,)).fetchone()
        return self._row_to_dict(row) if row else None

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> dict:
        data = dict(row)
        try:
            data["data"] = json.loads(data.get("data") or "{}")
        except json.JSONDecodeError:
            data["data"] = {}
        return data
