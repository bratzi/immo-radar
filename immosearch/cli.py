"""Kommandozeile von ImmoSearch."""

from __future__ import annotations

import argparse
import csv
import json
import logging
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from rich.console import Console
from rich.table import Table

from . import __version__
from .config import (
    DEFAULT_CONFIG, DEFAULT_SOURCES, EXAMPLE_CONFIG, AppConfig, load_config,
)
from .extract import enrich
from .finance import FinancingAssumptions, evaluate as evaluate_finance
from .models import Evaluation, Listing
from .report import print_detail, print_table, write_html
from .scoring import score as score_listing
from .sources import HttpClient, SearchQuery, build_sources
from .sources.base import RobotsDisallowed
from .storage import Store
from .util import normalize

console = Console()
log = logging.getLogger("immosearch")


# ---------------------------------------------------------------------------
# Kern: suchen und bewerten
# ---------------------------------------------------------------------------

def run_search(
    config: AppConfig,
    query: SearchQuery,
    *,
    kategorien: set[str],
    only: set[str] | None = None,
) -> list[Evaluation]:
    client = HttpClient(
        user_agent=config.http.user_agent,
        delay_seconds=config.http.delay_seconds,
        timeout=config.http.timeout,
        respect_robots=config.http.respect_robots,
    )
    sources = build_sources(config.sources, client, categories=kategorien, only=only)
    if not sources:
        console.print("[red]Keine Quellen aktiv.[/red] Prüfe config/sources.yaml oder --quelle.")
        return []

    console.print(
        f"Suche [bold]{query.name}[/bold] in {len(sources)} Quellen: "
        + ", ".join(s.id for s in sources)
    )

    listings: list[Listing] = []
    for source in sources:
        found = 0
        try:
            for listing in source.search(query):
                listings.append(listing)
                found += 1
        except RobotsDisallowed as exc:
            console.print(f"  [yellow]{source.id}: robots.txt verbietet den Abruf ({exc})[/yellow]")
            continue
        except Exception as exc:  # eine kaputte Quelle darf den Lauf nicht stoppen
            console.print(f"  [yellow]{source.id}: {type(exc).__name__}: {exc}[/yellow]")
            continue
        console.print(f"  {source.id}: {found} Inserate")

    return evaluate_listings(listings, config, query)


def evaluate_listings(
    listings: list[Listing], config: AppConfig, query: SearchQuery
) -> list[Evaluation]:
    """Filtern, Kennzahlen rechnen, bewerten, sortieren."""
    ausschluss = [normalize(k) for k in query.ausschluss_keywords]

    seen: set[str] = set()
    evaluations: list[Evaluation] = []
    for listing in listings:
        if listing.uid in seen:
            continue
        seen.add(listing.uid)

        if query.bundesland and not listing.state:
            listing.state = query.bundesland

        text = normalize(listing.text)
        if any(word and word in text for word in ausschluss):
            continue
        if listing.price is not None:
            if query.preis_max and listing.price > query.preis_max * 1.15:
                continue  # 15 % Puffer, weil Inserate oft knapp über der Grenze liegen
            if query.preis_min and listing.price < query.preis_min * 0.85:
                continue

        finance = evaluate_finance(listing, config.financing)
        evaluations.append(score_listing(listing, finance, config.scoring))

    evaluations.sort(key=lambda e: (not e.rejected, e.score), reverse=True)
    return evaluations


# ---------------------------------------------------------------------------
# Befehle
# ---------------------------------------------------------------------------

def cmd_init(args) -> int:
    target = Path(args.config or DEFAULT_CONFIG)
    if target.exists() and not args.force:
        console.print(f"[yellow]{target} existiert bereits.[/yellow] Überschreiben mit --force.")
        return 1
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(EXAMPLE_CONFIG, target)
    console.print(f"[green]Angelegt:[/green] {target}")
    console.print(
        "\nJetzt anpassen:\n"
        "  1. [bold]suchprofile[/bold] – Ort, Umkreis, Preisrahmen\n"
        "  2. [bold]finanzierung.zinssatz/tilgung[/bold] – Konditionen deiner Bank\n"
        "  3. [bold]finanzierung.markt_miete_pro_plz[/bold] – Mietniveau deiner Region\n"
        "  4. [bold]benachrichtigung[/bold] – Telegram oder E-Mail\n\n"
        "Danach: [bold]immosearch doctor[/bold] (Quellen prüfen), dann "
        "[bold]immosearch search[/bold]."
    )
    return 0


def cmd_sources(args) -> int:
    config = load_config(args.config, args.sources)
    table = Table(title="Konfigurierte Quellen", expand=True)
    table.add_column("ID")
    table.add_column("Name", max_width=40)
    table.add_column("Typ")
    table.add_column("Kategorie")
    table.add_column("Aktiv")
    table.add_column("Status")
    for definition in config.sources:
        aktiv = definition.get("enabled", True)
        table.add_row(
            definition.get("id", "?"),
            definition.get("name", ""),
            definition.get("type", "html"),
            definition.get("category", "nische"),
            "[green]ja[/green]" if aktiv else "[dim]nein[/dim]",
            definition.get("status", "-"),
        )
    console.print(table)
    console.print(
        "[dim]Kategorien: kleinanzeigen · nische · zwangsversteigerung · gross\n"
        "Große Portale zuschalten: immosearch search --grosse-portale[/dim]"
    )
    return 0


def cmd_doctor(args) -> int:
    """Jede Quelle einmal anfragen und melden, ob Selektoren greifen."""
    config = load_config(args.config, args.sources)
    query = config.profile(args.profil)
    query.max_seiten = 1

    client = HttpClient(
        user_agent=config.http.user_agent,
        delay_seconds=config.http.delay_seconds,
        timeout=config.http.timeout,
        respect_robots=config.http.respect_robots,
    )
    only = {args.quelle} if args.quelle else None
    kategorien = None if args.alle else set(config.quellen_kategorien)
    sources = build_sources(config.sources, client, categories=kategorien, only=only)

    table = Table(title="Quellen-Diagnose", expand=True)
    table.add_column("Quelle")
    table.add_column("Ergebnis")
    table.add_column("Details", overflow="fold")

    problems = 0
    for source in sources:
        try:
            listings = []
            for index, listing in enumerate(source.search(query)):
                listings.append(listing)
                if index >= 4:
                    break
            if listings:
                mit_preis = sum(1 for l in listings if l.price)
                table.add_row(
                    source.id,
                    "[green]OK[/green]",
                    f"{len(listings)} Treffer, davon {mit_preis} mit erkanntem Preis · "
                    f"Beispiel: {listings[0].title[:60]}",
                )
            else:
                problems += 1
                table.add_row(source.id, "[yellow]LEER[/yellow]",
                              "Abruf lief, aber kein Item gefunden – Selektoren prüfen")
        except RobotsDisallowed:
            table.add_row(source.id, "[yellow]ROBOTS[/yellow]", "robots.txt verbietet den Abruf")
        except Exception as exc:
            problems += 1
            table.add_row(source.id, "[red]FEHLER[/red]", f"{type(exc).__name__}: {exc}")

    console.print(table)
    if problems:
        console.print(
            f"\n[yellow]{problems} Quelle(n) brauchen Nacharbeit.[/yellow] "
            "Markup anschauen mit: [bold]immosearch inspect <id> --save seite.html[/bold], "
            "dann Selektoren in config/sources.yaml korrigieren."
        )
    return 0


def cmd_inspect(args) -> int:
    """Rohes HTML einer Quelle holen – zum Reparieren der Selektoren."""
    config = load_config(args.config, args.sources)
    query = config.profile(args.profil)
    query.max_seiten = 1

    definition = next((d for d in config.sources if d.get("id") == args.quelle), None)
    if definition is None:
        console.print(f"[red]Quelle {args.quelle!r} nicht gefunden.[/red]")
        return 1

    client = HttpClient(
        user_agent=config.http.user_agent,
        delay_seconds=config.http.delay_seconds,
        timeout=config.http.timeout,
        respect_robots=config.http.respect_robots,
    )
    source = build_sources([definition], client, only={args.quelle})[0]

    if hasattr(source, "urls_for"):
        urls = source.urls_for(query)
    elif hasattr(source, "build_urls"):
        urls = source.build_urls(query)
    else:
        urls = [definition.get("feed_url", "")]

    if not urls:
        console.print("[red]Keine URL konstruierbar – search_url/Platzhalter prüfen.[/red]")
        return 1

    url = urls[0]
    console.print(f"Abruf: [bold]{url}[/bold]")
    response = client.get(url, ignore_robots=definition.get("ignore_robots", False))
    console.print(f"HTTP {response.status_code}, {len(response.content):,} Bytes")

    if args.save:
        Path(args.save).write_text(response.text, encoding="utf-8")
        console.print(f"[green]Gespeichert:[/green] {args.save}")
    else:
        console.print(response.text[:3000])
    return 0


def cmd_search(args) -> int:
    config = load_config(args.config, args.sources)
    query = config.profile(args.profil)
    if args.seiten:
        query.max_seiten = args.seiten
    if args.ort:
        query.ort = args.ort
    if args.preis_max:
        query.preis_max = args.preis_max

    kategorien = set(config.quellen_kategorien)
    if args.grosse_portale:
        kategorien.add("gross")
    if args.nur_kleinanzeigen:
        kategorien = {"kleinanzeigen"}
    only = set(args.quelle) if args.quelle else None

    started = datetime.now(timezone.utc).isoformat(timespec="seconds")
    evaluations = run_search(config, query, kategorien=kategorien, only=only)

    sichtbar = [e for e in evaluations if not e.rejected or args.zeige_abgelehnte]
    if args.min_score:
        sichtbar = [e for e in sichtbar if e.score >= args.min_score]

    if not sichtbar:
        console.print(
            "\n[yellow]Keine Treffer, die die Kriterien erfüllen.[/yellow] "
            f"({len(evaluations)} Inserate geprüft, "
            f"{sum(1 for e in evaluations if e.rejected)} durch harte Filter aussortiert)\n"
            "Mit [bold]--zeige-abgelehnte[/bold] siehst du die Ablehnungsgründe."
        )
    else:
        print_table(sichtbar, limit=args.limit)

    # Speichern und neue Treffer melden
    neue: list[Evaluation] = []
    with Store(config.database) as store:
        for evaluation in evaluations:
            result = store.upsert(evaluation)
            if result["neu"] and evaluation.score >= config.notify.min_score and not evaluation.rejected:
                neue.append(evaluation)
            elif result["preis_alt"] and not evaluation.rejected:
                console.print(
                    f"[cyan]Preissenkung:[/cyan] {evaluation.listing.title[:50]} "
                    f"{result['preis_alt']:,.0f} € → {result['preis_neu']:,.0f} €"
                )
                neue.append(evaluation)
        store.log_run(query.name, started, len(evaluations), len(neue))

        if neue:
            store.mark_notified([e.listing.uid for e in neue])

    html_path = None
    if config.notify.html_report and sichtbar:
        html_path = write_html(sichtbar, config.notify.html_report, query.name, config.financing)
        console.print(f"\n[green]HTML-Report:[/green] {html_path}")

    if neue and not args.kein_versand:
        from .notify import send_email, send_telegram

        if config.notify.telegram_token and config.notify.telegram_chat_id:
            if send_telegram(config.notify.telegram_token, config.notify.telegram_chat_id, neue):
                console.print(f"[green]Telegram:[/green] {len(neue)} Treffer gemeldet")
        if config.notify.smtp_host:
            html = html_path.read_text(encoding="utf-8") if html_path else None
            if send_email(config.notify, neue, html):
                console.print(f"[green]E-Mail:[/green] {len(neue)} Treffer gemeldet")

    if args.detail and sichtbar:
        for evaluation in sichtbar[: args.detail]:
            print_detail(evaluation)

    return 0


def cmd_watch(args) -> int:
    """Dauerlauf: in festem Intervall suchen und nur Neues melden."""
    interval = args.intervall * 60
    console.print(
        f"[bold]Dauerlauf gestartet[/bold] – alle {args.intervall} Minuten. Beenden mit Strg+C."
    )
    runs = 0
    try:
        while True:
            runs += 1
            console.rule(f"Lauf {runs} · {datetime.now():%d.%m.%Y %H:%M}")
            try:
                cmd_search(args)
            except Exception as exc:  # ein Fehlschlag darf den Dauerlauf nicht beenden
                console.print(f"[red]Lauf fehlgeschlagen:[/red] {type(exc).__name__}: {exc}")
            time.sleep(interval)
    except KeyboardInterrupt:
        console.print("\n[dim]Beendet.[/dim]")
    return 0


def cmd_calc(args) -> int:
    """Schnellrechner für ein einzelnes Objekt – ohne Suche."""
    config = load_config(args.config, args.sources)
    assumptions = config.financing
    if args.zins is not None:
        assumptions.zinssatz = args.zins
    if args.tilgung is not None:
        assumptions.tilgung = args.tilgung
    if args.modus:
        assumptions.mode = args.modus

    listing = Listing(
        source="manuell", source_id="calc", url="-",
        title=args.titel or "Manuelle Berechnung",
        price=args.preis,
        living_area=args.flaeche,
        units=args.einheiten,
        year_built=args.baujahr,
        rent_year=args.miete_jahr,
        rent_month=args.miete_monat,
        zip_code=args.plz,
        state=args.bundesland,
        commission_free=args.provisionsfrei,
    )
    listing = enrich(listing)
    finance = evaluate_finance(listing, assumptions)
    if finance is None:
        console.print("[red]Zu wenig Daten:[/red] Kaufpreis und Miete (oder Fläche) nötig.")
        return 1
    print_detail(score_listing(listing, finance, config.scoring))
    return 0


def cmd_show(args) -> int:
    config = load_config(args.config, args.sources)
    with Store(config.database) as store:
        if args.uid:
            row = store.get(args.uid)
            rows = [row] if row else []
        elif args.preissenkungen:
            rows = store.price_drops(args.min_prozent)
        elif args.langlieger:
            rows = store.stale(args.tage)
        else:
            rows = store.top(limit=args.limit, min_score=args.min_score or 0)

    if not rows:
        console.print("[yellow]Nichts gefunden.[/yellow] Erst [bold]immosearch search[/bold] laufen lassen.")
        return 0

    table = Table(title="Gespeicherte Objekte", expand=True)
    for column in ("Score", "Objekt", "Ort", "Preis", "Erstpreis", "Erstmals", "UID"):
        table.add_column(column, overflow="ellipsis")
    for row in rows:
        table.add_row(
            f"{row['score']:.0f}" if row["score"] is not None else "–",
            (row["title"] or "")[:50],
            row["city"] or "–",
            f"{row['price']:,.0f} €" if row["price"] else "–",
            f"{row['first_price']:,.0f} €" if row["first_price"] else "–",
            (row["first_seen"] or "")[:10],
            row["uid"],
        )
    console.print(table)
    return 0


def cmd_export(args) -> int:
    config = load_config(args.config, args.sources)
    with Store(config.database) as store:
        rows = store.top(limit=args.limit, min_score=args.min_score or 0)

    target = Path(args.datei)
    target.parent.mkdir(parents=True, exist_ok=True)

    if args.format == "json":
        target.write_text(json.dumps(rows, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    else:
        columns = ["score", "title", "city", "zip_code", "state", "price", "first_price",
                   "living_area", "units", "rent_year", "source", "first_seen", "last_seen", "url"]
        with target.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore", delimiter=";")
            writer.writeheader()
            writer.writerows(rows)
    console.print(f"[green]Export:[/green] {target} ({len(rows)} Objekte)")
    return 0


# ---------------------------------------------------------------------------
# Argumente
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="immosearch",
        description="Findet und bewertet Anlageimmobilien für die 100 %-Finanzierung.",
    )
    parser.add_argument("--version", action="version", version=f"ImmoSearch {__version__}")
    parser.add_argument("-c", "--config", help=f"Konfigurationsdatei (Standard: {DEFAULT_CONFIG})")
    parser.add_argument("--sources", help=f"Quellendatei (Standard: {DEFAULT_SOURCES})")
    parser.add_argument("-v", "--verbose", action="store_true", help="Ausführliches Logging")

    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init", help="config.yaml aus der Vorlage anlegen")
    p.add_argument("--force", action="store_true")
    p.set_defaults(func=cmd_init)

    p = sub.add_parser("sources", help="Quellen auflisten")
    p.set_defaults(func=cmd_sources)

    p = sub.add_parser("doctor", help="Quellen testen (greifen die Selektoren?)")
    p.add_argument("-p", "--profil")
    p.add_argument("--quelle", help="nur diese Quelle")
    p.add_argument("--alle", action="store_true", help="auch deaktivierte Kategorien")
    p.set_defaults(func=cmd_doctor)

    p = sub.add_parser("inspect", help="Roh-HTML einer Quelle holen (Selektoren reparieren)")
    p.add_argument("quelle")
    p.add_argument("-p", "--profil")
    p.add_argument("--save", help="HTML in Datei speichern")
    p.set_defaults(func=cmd_inspect)

    p = sub.add_parser("search", help="Suchlauf starten")
    p.add_argument("-p", "--profil", help="Suchprofil aus der config.yaml")
    p.add_argument("--ort", help="Ort überschreiben")
    p.add_argument("--preis-max", type=int, dest="preis_max")
    p.add_argument("--seiten", type=int, help="Seiten je Quelle")
    p.add_argument("--quelle", action="append", help="nur diese Quelle(n), mehrfach nutzbar")
    p.add_argument("--grosse-portale", action="store_true", dest="grosse_portale",
                   help="große Portale (ImmoScout24, Immowelt, Immonet) zusätzlich abfragen")
    p.add_argument("--nur-kleinanzeigen", action="store_true", dest="nur_kleinanzeigen")
    p.add_argument("--min-score", type=float, dest="min_score")
    p.add_argument("--limit", type=int, default=30)
    p.add_argument("--detail", type=int, default=0, metavar="N",
                   help="die N besten Treffer ausführlich anzeigen")
    p.add_argument("--zeige-abgelehnte", action="store_true", dest="zeige_abgelehnte",
                   help="auch aussortierte Objekte samt Grund zeigen")
    p.add_argument("--kein-versand", action="store_true", dest="kein_versand")
    p.set_defaults(func=cmd_search)

    p = sub.add_parser("watch", help="Dauerlauf: regelmäßig suchen, nur Neues melden")
    p.add_argument("--intervall", type=int, default=60, help="Minuten zwischen zwei Läufen")
    p.add_argument("-p", "--profil")
    p.add_argument("--ort")
    p.add_argument("--preis-max", type=int, dest="preis_max")
    p.add_argument("--seiten", type=int)
    p.add_argument("--quelle", action="append")
    p.add_argument("--grosse-portale", action="store_true", dest="grosse_portale")
    p.add_argument("--nur-kleinanzeigen", action="store_true", dest="nur_kleinanzeigen")
    p.add_argument("--min-score", type=float, dest="min_score")
    p.add_argument("--limit", type=int, default=15)
    p.add_argument("--detail", type=int, default=0)
    p.add_argument("--zeige-abgelehnte", action="store_true", dest="zeige_abgelehnte")
    p.add_argument("--kein-versand", action="store_true", dest="kein_versand")
    p.set_defaults(func=cmd_watch)

    p = sub.add_parser("calc", help="Schnellrechner für ein einzelnes Objekt")
    p.add_argument("--preis", type=float, required=True)
    p.add_argument("--miete-jahr", type=float, dest="miete_jahr", help="Jahresnettokaltmiete")
    p.add_argument("--miete-monat", type=float, dest="miete_monat")
    p.add_argument("--flaeche", type=float, help="Wohnfläche in m²")
    p.add_argument("--einheiten", type=int)
    p.add_argument("--baujahr", type=int)
    p.add_argument("--plz")
    p.add_argument("--bundesland", help="Kürzel, z. B. NW – sonst aus der PLZ")
    p.add_argument("--zins", type=float)
    p.add_argument("--tilgung", type=float)
    p.add_argument("--modus", choices=["100", "110", "custom"])
    p.add_argument("--provisionsfrei", action="store_true", default=None)
    p.add_argument("--titel")
    p.set_defaults(func=cmd_calc)

    p = sub.add_parser("show", help="Gespeicherte Objekte ansehen")
    p.add_argument("--uid")
    p.add_argument("--limit", type=int, default=25)
    p.add_argument("--min-score", type=float, dest="min_score")
    p.add_argument("--preissenkungen", action="store_true", help="Objekte mit gesenktem Preis")
    p.add_argument("--min-prozent", type=float, default=3.0, dest="min_prozent")
    p.add_argument("--langlieger", action="store_true", help="lange inserierte Objekte")
    p.add_argument("--tage", type=int, default=45)
    p.set_defaults(func=cmd_show)

    p = sub.add_parser("export", help="Objekte als CSV oder JSON exportieren")
    p.add_argument("datei")
    p.add_argument("--format", choices=["csv", "json"], default="csv")
    p.add_argument("--limit", type=int, default=500)
    p.add_argument("--min-score", type=float, dest="min_score")
    p.set_defaults(func=cmd_export)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )
    try:
        return args.func(args)
    except KeyError as exc:
        console.print(f"[red]{exc}[/red]")
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
