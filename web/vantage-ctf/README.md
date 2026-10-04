# VANTAGE Procurement Cloud — UNION SQLi (PostgreSQL)

A production-styled enterprise web challenge for CTF use. The app is a B2B
procurement portal with a browsable product catalog. One catalog filter is
vulnerable to **UNION-based SQL injection** against a **PostgreSQL** backend.
The flag lives in an internal table the catalog never references — reachable
only by enumerating the schema and reading it out through the injection.

```
Category    Web / SQL Injection
Type        UNION-based, in-band
Database    PostgreSQL 16
Difficulty  Medium  (multi-step: param discovery → WAF bypass → schema enum → exfil)
Flag        Securinets{...}
```

---

## Player brief (safe to publish)

> **VANTAGE Procurement Cloud**
> Our new vendor catalog is live. Browse away — it's read-only and locked down.
> Our security team added a web application firewall, so don't bother with the
> usual tricks. We're confident there's nothing sensitive reachable from the
> public catalog.

Give players only the URL. Everything else is discovery.

---

## Quick start

Requires Docker + the Compose plugin.

```bash
docker compose up --build
```

Then open <http://localhost:8080>. The catalog is at `/catalog`; a JSON mirror of
the same query is at `/api/products`.

Check it's healthy:

```bash
curl -s localhost:8080/health          # {"status":"ok"}
```

### Reset between events

The flag is seeded on first database init. To wipe state and re-seed cleanly:

```bash
docker compose down -v && docker compose up --build
```

### Change the flag

Edit the `ctf_flag` row in [`db/init.sql`](db/init.sql), then reset with
`down -v` so the volume is recreated.

### Change the exposed port

Edit the `app` service `ports:` mapping in
[`docker-compose.yml`](docker-compose.yml) (default `8080:5000`).

---

## How the challenge is built (author summary)

- **Two inputs, one vulnerable.** `/catalog` takes `q` (search) and `category`
  (filter). `q` is a bound parameter and is **safe** — a deliberate red herring.
  `category` is **string-concatenated** into the SQL and is the injection point.
- **A naive WAF** rejects boolean-based (`OR 1=1`), stacked (`;`), and time-based
  (`pg_sleep`) payloads, plus the literal `UNION [ALL] SELECT` token. It is
  bypassable, steering solvers to a UNION read-out.
- **Errors are hidden.** Failed queries render a generic banner (no driver/DB
  text), so column count is inferred from behaviour, not error leakage.
- **Least privilege.** The app connects as `vantage_app`, which holds `SELECT`
  only. Even if a solver smuggles a write past the WAF, the role can't execute
  it — so UNION extraction is the intended and only productive path.
- **The objective** is the `ctf_flag` row of the `vault_secrets` table. The
  catalog never queries that table; it must be found via `information_schema`.
- Decoy loot (`employees` password hashes, other `vault_secrets` rows) is present
  so enumeration feels realistic and the flag format is the disambiguator.

The full intended solution with copy-paste payloads is in
[`SOLUTION.md`](SOLUTION.md) — keep that away from players.

---

## Project layout

```
vantage-ctf/
├── docker-compose.yml      # app + postgres, isolated network, DB not published
├── README.md
├── SOLUTION.md             # intended path + payloads (SPOILER)
├── app/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app.py              # Flask app; contains the planted vulnerability
│   ├── templates/          # base, index, catalog, sso, 404
│   └── static/css/styles.css
└── db/
    └── init.sql            # schema, seed data, hidden flag, app role grants
```

---

## Safety / scope

This application is **intentionally vulnerable** and is meant to run only in an
isolated CTF environment (a local Docker host or a segmented challenge VLAN).
Do not deploy it on the public internet or on any network where it could be
confused with a real service. The database port is intentionally unpublished;
keep it that way.
