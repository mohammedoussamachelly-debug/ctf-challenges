"""
admin_bot.py — simulates the Scrapline admin reviewing reported links.

In-fiction justification for why the admin opens attacker-supplied URLs:
the /report feature invites people to report suspicious links, and the
admin team investigates each one by opening it, logged into their account.

Run this on a timer (this script itself polls every POLL_SECONDS) pointed
at the app's internal URL, sharing the same SQLite database file so it can
read the `reports` table.
"""
import os
import sqlite3
import time
from urllib.parse import urlsplit, urlunsplit

from playwright.sync_api import sync_playwright

APP_URL = os.environ.get("APP_URL", "http://localhost:5000")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Adm1n_Only_2038!")
DB_PATH = os.environ.get("SCRAPLINE_DB", "scrapline.db")
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "5"))


def to_local(reported):
    """The admin only ever browses its own site. Take just the path+query
    (+fragment) from whatever was reported and visit it on APP_URL. This keeps
    every visit same-origin with the admin's login — so the SameSite=Strict
    session cookie always applies — regardless of which host (public IP,
    hostname, ...) the reporter typed. The exploit chain is unchanged; this
    only removes the deployment artifact where a reported public URL would be a
    different origin than the admin's internal login."""
    parts = urlsplit(reported)
    path_q = urlunsplit(("", "", parts.path or "/", parts.query, parts.fragment))
    return APP_URL.rstrip("/") + path_q


def _db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def fetch_pending():
    db = _db()
    rows = db.execute(
        "SELECT id, url FROM reports WHERE status = 'pending' ORDER BY id"
    ).fetchall()
    db.close()
    return rows


def mark_visited(report_id):
    db = _db()
    db.execute("UPDATE reports SET status = 'visited' WHERE id = ?", (report_id,))
    db.commit()
    db.close()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Log in once as admin; reuse the authenticated context (and its
        # SameSite=Strict session cookie) for every subsequent visit.
        page.goto(f"{APP_URL}/login")
        page.fill("input[name=username]", ADMIN_USERNAME)
        page.fill("input[name=password]", ADMIN_PASSWORD)
        page.click("button[type=submit]")
        page.wait_for_load_state("networkidle")
        print("[admin_bot] logged in, watching for reported links...")

        while True:
            for report_id, url in fetch_pending():
                target = to_local(url)
                print(f"[admin_bot] report #{report_id}: {url} -> visiting {target}")
                try:
                    visit_page = context.new_page()
                    visit_page.goto(target, timeout=10000)
                    visit_page.wait_for_timeout(4000)  # let any client-side redirect fire
                    visit_page.close()
                except Exception as exc:  # noqa: BLE001 - keep the bot alive
                    print(f"[admin_bot] error visiting {target}: {exc}")
                mark_visited(report_id)
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
