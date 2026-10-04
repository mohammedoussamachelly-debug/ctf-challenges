"""
VANTAGE Procurement Cloud — application server.

CTF challenge code. It contains an INTENTIONAL SQL injection vulnerability for
training purposes. Do not use any of this as a reference for real code.

Design of the planted bug
--------------------------
* The catalog search endpoint accepts two user inputs:
    - `q`        -> the free-text search box.  SAFELY parameterised (red herring).
    - `category` -> the category filter.        VULNERABLE: string-concatenated.
* A naive "WAF" rejects boolean-based, stacked, and time-based payloads, plus the
  literal `UNION [ALL] SELECT` token. It is deliberately bypassable (inline
  comments) so the intended solution is a UNION-based read-out.
* Raw PostgreSQL errors are never shown to the client (production-like). A failed
  query renders a generic banner, so column count must be inferred from
  success/failure behaviour (e.g. ORDER BY probing) rather than from error text.
* The app connects as a least-privilege role (`vantage_app`) that can only SELECT
  the catalog tables. Stacked writes buy nothing; UNION read-out is the path.
"""

import os
import re
import time

import psycopg2
import psycopg2.extras
from flask import Flask, render_template, request, jsonify, abort

app = Flask(__name__)

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------
DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "db"),
    "port": int(os.environ.get("DB_PORT", "5432")),
    "dbname": os.environ.get("DB_NAME", "vantage"),
    "user": os.environ.get("DB_USER", "vantage_app"),
    "password": os.environ.get("DB_PASSWORD", "app_only_readonly_pw"),
}

CATEGORIES = [
    "Servers", "Networking", "Storage",
    "Licensing", "Security", "Power",
]


def get_connection(retries: int = 1):
    """Open a short-lived connection. Retries briefly so the app survives the
    database still booting on first `docker compose up`."""
    last_err = None
    for attempt in range(retries):
        try:
            return psycopg2.connect(**DB_CONFIG, connect_timeout=5)
        except psycopg2.OperationalError as err:  # pragma: no cover - startup race
            last_err = err
            time.sleep(1.5)
    raise last_err


def wait_for_db(max_wait: int = 60) -> None:
    """Block until the database is reachable (used at startup)."""
    deadline = time.time() + max_wait
    while time.time() < deadline:
        try:
            conn = psycopg2.connect(**DB_CONFIG, connect_timeout=3)
            conn.close()
            return
        except psycopg2.OperationalError:
            time.sleep(1.5)
    # Don't crash the worker; requests will surface a friendly error instead.


# -----------------------------------------------------------------------------
# "WAF" — intentionally shallow. Steers solvers toward a UNION bypass.
# -----------------------------------------------------------------------------
_BLOCKLIST = [
    r";",                          # stacked queries
    r"\bor\b\s+\d",                # OR 1=1 style boolean
    r"\bor\b\s+'",                 # OR '1'='1 style boolean
    r"\bxor\b",
    r"pg_sleep",                   # time-based
    r"\bsleep\s*\(",
    r"\bbenchmark\s*\(",
    r"\bdrop\b",                   # DDL / DML
    r"\bdelete\b",
    r"\bupdate\b",
    r"\binsert\b",
    r"\balter\b",
    r"\bcopy\b",
    r"\bgrant\b",
    r"union\s+(all\s+)?select",    # naive UNION token — bypass with /**/ etc.
]
_BLOCK_RE = [re.compile(p, re.IGNORECASE) for p in _BLOCKLIST]


def waf_block(value: str) -> bool:
    return any(rx.search(value) for rx in _BLOCK_RE)


# -----------------------------------------------------------------------------
# Catalog query
# -----------------------------------------------------------------------------
def query_catalog(category: str | None, q: str | None):
    """Build and run the catalog query.

    `category` is concatenated (the vulnerability). `q` is bound as a parameter
    (safe). Returns (rows, error_message_or_None)."""
    sql = "SELECT product_code, name, description, category, vendor, price_usd FROM products WHERE 1=1"
    params: list = []

    if category is not None and category != "":
        # ---- VULNERABLE: user input flows straight into the SQL text. ----
        sql += " AND category = '" + category + "'"

    if q:
        # ---- SAFE: parameterised. This input cannot break out. ----
        sql += " AND name ILIKE %s"
        params.append(f"%{q}%")

    sql += " AND is_active = TRUE ORDER BY name ASC"

    conn = None
    try:
        conn = get_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        # Pass params only when present so attacker-supplied '%' in `category`
        # is never treated as a psycopg2 format marker on the UNION path.
        if params:
            cur.execute(sql, params)
        else:
            cur.execute(sql)
        rows = cur.fetchall()
        cur.close()
        return rows, None
    except psycopg2.Error:
        # Production behaviour: never leak the driver/DB error to the client.
        if conn is not None:
            conn.rollback()
        return None, "The catalog service could not complete this request."
    finally:
        if conn is not None:
            conn.close()


# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------
@app.route("/")
def home():
    return render_template("index.html", categories=CATEGORIES)


@app.route("/catalog")
def catalog():
    # `category` present-but-empty ("All categories") returns everything.
    category = request.args.get("category", None)
    q = request.args.get("q", "").strip()

    blocked = False
    rows = None
    error = None

    for candidate in (category, q):
        if candidate and waf_block(candidate):
            blocked = True
            break

    if not blocked:
        rows, error = query_catalog(category, q)

    return render_template(
        "catalog.html",
        categories=CATEGORIES,
        selected_category=category,
        q=q,
        rows=rows,
        error=error,
        blocked=blocked,
    )


@app.route("/api/products")
def api_products():
    """JSON mirror of the catalog query (same vulnerable builder)."""
    category = request.args.get("category", None)
    q = request.args.get("q", "").strip()

    for candidate in (category, q):
        if candidate and waf_block(candidate):
            return jsonify({"error": "Request blocked by security policy.", "code": "WAF_DENY"}), 403

    rows, error = query_catalog(category, q)
    if error:
        return jsonify({"error": error}), 500
    # RealDictRow is JSON-serialisable via dict()
    data = [dict(r) for r in rows]
    for r in data:
        if r.get("price_usd") is not None:
            r["price_usd"] = float(r["price_usd"])
    return jsonify({"count": len(data), "results": data})


@app.route("/sso")
def sso():
    # Static placeholder so the "Sign in" nav link resolves. Non-functional.
    return render_template("sso.html")


@app.route("/health")
def health():
    try:
        conn = get_connection()
        conn.close()
        return jsonify({"status": "ok"})
    except psycopg2.Error:
        return jsonify({"status": "degraded"}), 503


@app.errorhandler(404)
def not_found(_e):
    return render_template("404.html"), 404


if __name__ == "__main__":
    wait_for_db()
    app.run(host="0.0.0.0", port=5000)
