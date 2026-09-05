"""Benachrichtigungen: Telegram und E-Mail."""

from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage

import requests

from .models import Evaluation

log = logging.getLogger(__name__)


def format_short(evaluation: Evaluation) -> str:
    listing = evaluation.listing
    finance = evaluation.finance
    lines = [f"[{evaluation.score:.0f}] {listing.title}"]
    if listing.price:
        lines.append(f"{listing.price:,.0f} €".replace(",", "."))
    if finance:
        lines.append(
            f"Faktor {finance.faktor:.1f} · {finance.brutto_rendite:.1f} % brutto · "
            f"Cashflow {finance.cf_nach_steuer_monat():+,.0f} €/Mon"
        )
        if finance.miete_ist_geschaetzt:
            lines.append("(Miete geschätzt)")
    if evaluation.flags:
        lines.append("+ " + ", ".join(evaluation.flags))
    lines.append(listing.url)
    return "\n".join(lines)


def send_telegram(token: str, chat_id: str, evaluations: list[Evaluation]) -> bool:
    if not evaluations:
        return True
    header = f"🏠 {len(evaluations)} neue Treffer\n\n"
    body = "\n\n".join(format_short(e) for e in evaluations[:10])
    if len(evaluations) > 10:
        body += f"\n\n… und {len(evaluations) - 10} weitere im HTML-Report."
    try:
        response = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": header + body, "disable_web_page_preview": True},
            timeout=20,
        )
        response.raise_for_status()
        return True
    except requests.RequestException as exc:
        log.error("Telegram-Versand fehlgeschlagen: %s", exc)
        return False


def send_email(config, evaluations: list[Evaluation], html: str | None = None) -> bool:
    if not evaluations or not config.smtp_host or not config.smtp_to:
        return True
    password = config.smtp_password or os.environ.get("IMMOSEARCH_SMTP_PASSWORD")

    message = EmailMessage()
    message["Subject"] = f"ImmoSearch: {len(evaluations)} neue Treffer"
    message["From"] = config.smtp_from or config.smtp_user
    message["To"] = ", ".join(config.smtp_to)
    message.set_content("\n\n".join(format_short(e) for e in evaluations))
    if html:
        message.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=30) as smtp:
            smtp.starttls()
            if config.smtp_user and password:
                smtp.login(config.smtp_user, password)
            smtp.send_message(message)
        return True
    except (smtplib.SMTPException, OSError) as exc:
        log.error("E-Mail-Versand fehlgeschlagen: %s", exc)
        return False
