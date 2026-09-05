"""Ausgabe: Konsolentabelle, Detailansicht und HTML-Report."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from jinja2 import Template
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from .models import Evaluation

console = Console()


def _score_color(score: float) -> str:
    if score >= 75:
        return "bright_green"
    if score >= 60:
        return "green"
    if score >= 40:
        return "yellow"
    return "red"


def _eur(value: float | None, decimals: int = 0) -> str:
    if value is None:
        return "–"
    return f"{value:,.{decimals}f}".replace(",", " ") + " €"


def print_table(evaluations: list[Evaluation], limit: int = 30) -> None:
    table = Table(title="Treffer nach Score", header_style="bold", expand=True)
    table.add_column("Score", justify="right", width=6)
    table.add_column("Objekt", overflow="ellipsis", max_width=42)
    table.add_column("Ort", max_width=16)
    table.add_column("Preis", justify="right")
    table.add_column("Fkt.", justify="right", width=5)
    table.add_column("Brutto", justify="right", width=7)
    table.add_column("CF n.St.", justify="right", width=9)
    table.add_column("Einh.", justify="right", width=5)
    table.add_column("Quelle", max_width=16)

    for evaluation in evaluations[:limit]:
        listing = evaluation.listing
        finance = evaluation.finance
        color = _score_color(evaluation.score)
        marker = "≈" if finance and finance.miete_ist_geschaetzt else ""
        table.add_row(
            f"[{color}]{evaluation.score:.0f}[/{color}]",
            listing.title,
            listing.city or listing.zip_code or "–",
            _eur(listing.price),
            f"{finance.faktor:.1f}" if finance else "–",
            f"{finance.brutto_rendite:.1f}%" if finance else "–",
            (f"{finance.cf_nach_steuer_monat():+,.0f}{marker}" if finance else "–"),
            str(listing.units or "–"),
            listing.source,
        )
    console.print(table)
    console.print("[dim]CF n.St. = Cashflow nach Steuern in €/Monat · ≈ = Miete geschätzt[/dim]")


def print_detail(evaluation: Evaluation) -> None:
    listing = evaluation.listing
    finance = evaluation.finance

    lines = [
        f"[bold]{listing.title}[/bold]",
        f"[link={listing.url}]{listing.url}[/link]",
        "",
        f"Ort:            {listing.city or '–'} {listing.zip_code or ''} "
        f"({listing.state or 'Bundesland unbekannt'})",
        f"Kaufpreis:      {_eur(listing.price)}",
        f"Wohnfläche:     {listing.living_area or '–'} m²"
        + (f"  ({_eur(listing.price_per_sqm)}/m²)" if listing.price_per_sqm else ""),
        f"Einheiten:      {listing.units or '–'}   Baujahr: {listing.year_built or '–'}",
    ]

    if finance:
        lines += [
            "",
            "[bold]Finanzierung[/bold]",
            f"Kaufnebenkosten:      {_eur(finance.kaufnebenkosten)} ({finance.nebenkosten_quote:.2f} %)",
            f"Gesamtinvestition:    {_eur(finance.gesamtinvestition)}",
            f"Eigenkapital:         {_eur(finance.eigenkapital)}",
            f"Darlehen:             {_eur(finance.darlehen)} "
            f"(Beleihungsauslauf {finance.beleihungsauslauf:.0f} % vom Kaufpreis)",
            f"Annuität:             {_eur(finance.annuitaet)}/Jahr "
            f"({_eur(finance.annuitaet / 12)}/Monat)",
            f"Restschuld n. Bindung:{_eur(finance.restschuld_nach_zinsbindung)}",
            f"Volltilgung nach:     "
            + (f"{finance.jahre_bis_schuldenfrei:.1f} Jahren"
               if finance.jahre_bis_schuldenfrei else "nie (Annuität < Zinslast)"),
            "",
            "[bold]Ertrag[/bold]",
            f"Jahreskaltmiete:      {_eur(finance.jahreskaltmiete)}"
            + ("  [yellow](geschätzt)[/yellow]" if finance.miete_ist_geschaetzt else "  (laut Inserat)"),
            f"Bewirtschaftung:      -{_eur(finance.bewirtschaftungskosten)} (nicht umlagefähig)",
            f"Nettomietertrag:      {_eur(finance.noi)}",
            f"Kapitaldienst:        -{_eur(finance.annuitaet)}",
            f"[bold]Cashflow v. St.:      {_eur(finance.cashflow_vor_steuer)}/Jahr "
            f"= {_eur(finance.cf_vor_steuer_monat())}/Monat[/bold]",
            f"Steuereffekt:         {_eur(finance.steuereffekt)} (AfA {_eur(finance.afa)})",
            f"[bold]Cashflow n. St.:      {_eur(finance.cashflow_nach_steuer)}/Jahr "
            f"= {_eur(finance.cf_nach_steuer_monat())}/Monat[/bold]",
            "",
            "[bold]Kennzahlen[/bold]",
            f"Kaufpreisfaktor:      {finance.faktor:.1f}",
            f"Bruttomietrendite:    {finance.brutto_rendite:.2f} %",
            f"Nettomietrendite:     {finance.netto_rendite:.2f} % (auf Gesamtinvestition)",
            f"Kapitaldienstdeckung: {finance.dscr:.2f}",
        ]

    if evaluation.flags:
        lines += ["", "[green]Chancen:[/green] " + " · ".join(evaluation.flags)]
    if evaluation.warnings:
        lines += ["[yellow]Risiken:[/yellow] " + " · ".join(evaluation.warnings)]
    if evaluation.knockouts:
        lines += ["[red]Ausschluss:[/red] " + " · ".join(evaluation.knockouts)]

    color = _score_color(evaluation.score)
    console.print(
        Panel(
            "\n".join(lines),
            title=f"[{color}]Score {evaluation.score:.0f}/100[/{color}]",
            border_style=color,
        )
    )


HTML_TEMPLATE = """<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ImmoSearch – Treffer vom {{ datum }}</title>
<style>
 :root { color-scheme: light dark; --bg:#fbfaf8; --fg:#1c1b19; --card:#fff;
         --line:#e3e0da; --muted:#6b6862; }
 @media (prefers-color-scheme: dark) {
   :root { --bg:#16151a; --fg:#eceaf0; --card:#1f1e25; --line:#33313c; --muted:#a09daa; } }
 body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 -apple-system,
        BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; padding:24px; }
 h1 { font-size:22px; margin:0 0 4px; } .sub { color:var(--muted); margin-bottom:24px; }
 .card { background:var(--card); border:1px solid var(--line); border-radius:10px;
         padding:16px 18px; margin-bottom:14px; }
 .head { display:flex; gap:14px; align-items:baseline; flex-wrap:wrap; }
 .score { font-weight:700; font-size:20px; padding:2px 10px; border-radius:6px; color:#fff; }
 .s-hi{background:#1f8a4c}.s-mid{background:#b8860b}.s-lo{background:#9a3232}
 .title { font-weight:600; flex:1; min-width:220px; }
 .title a { color:inherit; text-decoration:none; } .title a:hover { text-decoration:underline; }
 .kpi { display:flex; flex-wrap:wrap; gap:18px; margin-top:12px; }
 .kpi div { min-width:110px; } .kpi .k { color:var(--muted); font-size:12px;
        text-transform:uppercase; letter-spacing:.4px; } .kpi .v { font-weight:600; }
 .tags { margin-top:10px; } .tag { display:inline-block; font-size:12px; padding:2px 8px;
        border-radius:20px; margin:2px 4px 2px 0; }
 .ok{background:#1f8a4c22;color:#1f8a4c}.warn{background:#b8860b22;color:#b8860b}
 .bad{background:#9a323222;color:#9a3232}
 .neg { color:#9a3232; } .pos { color:#1f8a4c; }
 footer { color:var(--muted); font-size:13px; margin-top:28px; }
</style></head><body>
<h1>ImmoSearch – {{ treffer|length }} Treffer</h1>
<div class="sub">Profil <b>{{ profil }}</b> · Finanzierung {{ modus }} % ·
  {{ zins }} % Zins / {{ tilgung }} % Tilgung · erstellt {{ datum }}</div>
{% for e in treffer %}
{% set f = e.finance %}
<div class="card">
  <div class="head">
    <span class="score {{ 's-hi' if e.score >= 70 else ('s-mid' if e.score >= 50 else 's-lo') }}">
      {{ '%.0f'|format(e.score) }}</span>
    <span class="title"><a href="{{ e.listing.url }}" target="_blank" rel="noopener">
      {{ e.listing.title }}</a></span>
    <span style="color:var(--muted)">{{ e.listing.city or e.listing.zip_code or '' }}
      · {{ e.listing.source }}</span>
  </div>
  {% if f %}
  <div class="kpi">
    <div><div class="k">Kaufpreis</div><div class="v">{{ '{:,.0f}'.format(f.kaufpreis) }} €</div></div>
    <div><div class="k">Faktor</div><div class="v">{{ '%.1f'|format(f.faktor) }}</div></div>
    <div><div class="k">Brutto</div><div class="v">{{ '%.2f'|format(f.brutto_rendite) }} %</div></div>
    <div><div class="k">Netto</div><div class="v">{{ '%.2f'|format(f.netto_rendite) }} %</div></div>
    <div><div class="k">CF n. St./Mon</div>
      <div class="v {{ 'pos' if f.cashflow_nach_steuer >= 0 else 'neg' }}">
      {{ '{:+,.0f}'.format(f.cashflow_nach_steuer / 12) }} €</div></div>
    <div><div class="k">Kapitaldienst</div><div class="v">{{ '%.2f'|format(f.dscr) }}</div></div>
    <div><div class="k">Darlehen</div><div class="v">{{ '{:,.0f}'.format(f.darlehen) }} €</div></div>
    <div><div class="k">Einheiten</div><div class="v">{{ e.listing.units or '–' }}</div></div>
  </div>
  {% if f.miete_ist_geschaetzt %}
  <div class="tags"><span class="tag warn">Miete geschätzt – Ist-Miete erfragen</span></div>
  {% endif %}
  {% else %}
  <div class="tags"><span class="tag warn">Keine Renditerechnung möglich (Preis oder Miete fehlt)</span></div>
  {% endif %}
  <div class="tags">
    {% for t in e.flags %}<span class="tag ok">{{ t }}</span>{% endfor %}
    {% for t in e.warnings %}<span class="tag warn">{{ t }}</span>{% endfor %}
    {% for t in e.knockouts %}<span class="tag bad">K.o.: {{ t }}</span>{% endfor %}
  </div>
</div>
{% endfor %}
<footer>Automatisch erzeugt von ImmoSearch. Alle Kennzahlen beruhen auf
Inseratsangaben und den Annahmen in der config.yaml – keine Anlageberatung.
Vor jedem Angebot: Ist-Mieten, Teilungserklärung, Grundbuch und
Instandhaltungsstau selbst prüfen.</footer>
</body></html>
"""


def write_html(
    evaluations: list[Evaluation], path: str | Path, profil: str, financing
) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    html = Template(HTML_TEMPLATE).render(
        treffer=evaluations,
        profil=profil,
        datum=datetime.now().strftime("%d.%m.%Y %H:%M"),
        modus=financing.mode,
        zins=financing.zinssatz,
        tilgung=financing.tilgung,
    )
    target.write_text(html, encoding="utf-8")
    return target
