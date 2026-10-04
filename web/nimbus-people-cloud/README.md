# NIMBUS People Cloud

> **Enterprise workforce platform** — employee directory, org chart, payroll and leave management.

![stack](https://img.shields.io/badge/stack-Node%20%2B%20Apollo%20%2B%20Postgres-7c5cff) ![type](https://img.shields.io/badge/CTF-web%20%2F%20GraphQL-0b1120)

---

## 🎯 Player brief

NIMBUS People Cloud is the HR system of record for a mid-size company. Every
employee can sign in to see their own profile, payslips, leave balance and
reporting line. The leadership team keeps some things a little more private.

You've been handed a **guest employee** account. The platform only lets you see
your own records. Find a way to read what you shouldn't be able to.

- **URL:** `http://localhost:8080`
- **Demo login:** `guest.employee@nimbus.example` / `N1mbus@Guest2026`
- **Flag format:** `Securinets{...}`

---

## 🚀 Running it (operator)

Requires Docker + the Compose plugin.

```bash
docker compose up --build        # play at http://localhost:8080
```

Reset everything (wipes the database volume and re-seeds, regenerating the
flag cleanly):

```bash
docker compose down -v
docker compose up --build
```

Stop without wiping data:

```bash
docker compose down
```

### Difficulty (operator-only — do not share with players)

The only player-facing surface is the app at `/` and the GraphQL endpoint at
`/graphql`. There is no built-in query explorer; players use their own GraphQL
tooling against `/graphql`.

- **Default:** GraphQL introspection is left enabled (the realistic
  misconfiguration), so standard tooling can map the schema.
- **Harder variant:** set `ENABLE_WAF=1` on the `app` service (in
  `docker-compose.yml` under `app.environment`, or `ENABLE_WAF=1 docker compose up`).
  This switches on a naive, *bypassable* gateway filter that blocks the
  `__schema` meta-query, forcing field-level introspection via
  `__type(name: ...)`. The IDOR and the flag are identical in both modes.

### What's where

| Path                     | Purpose                                             |
| ------------------------ | --------------------------------------------------- |
| `server/`                | Node.js + Apollo Server (GraphQL) + static frontend |
| `server/src/`            | Schema, resolvers, auth, optional naive input filter |
| `server/public/`         | The corporate SPA served at `/`                     |
| `db/init.sql`            | Schema + seed data + flag + least-privilege role    |
| `docker-compose.yml`     | Two services: `app` (8080) and `db` (not exposed)   |
| `SOLUTION.md`            | **Spoilers.** Keep away from players.               |

The GraphQL endpoint is `POST http://localhost:8080/graphql`.

---

## 🔒 Security / deployment notes

- **This application is intentionally vulnerable.** It exists to teach a
  GraphQL authorization bug. **Run it only on an isolated CTF host / lab
  network.** Do not deploy it on the public internet or any network with real
  data.
- The PostgreSQL port is **deliberately not published** to the host — only the
  `app` service is reachable (port 8080). Keep it that way.
- The application connects to PostgreSQL as a **least-privilege, read-mostly
  role** (`nimbus_app`): it can `SELECT` and append leave requests, nothing
  else. It is not a superuser and cannot alter the schema. A player who finds
  an injection still cannot drop tables or read other databases — the
  challenge is authorization, not RCE.
- The flag lives **server-side only**, in a single database column. It is
  never shipped to the browser by the product UI.

---

## 🏗️ Architecture

```
┌──────────────┐    GraphQL over HTTP    ┌─────────────────────┐    pg (nimbus_app)   ┌────────────┐
│  SPA (vanilla │ ──────────────────────▶ │  Apollo Server       │ ───────────────────▶ │ PostgreSQL │
│  HTML/CSS/JS) │   POST /graphql         │  (Node 22, Express)  │   least-privilege    │    16      │
└──────────────┘                         └─────────────────────┘                      └────────────┘
      :8080 (app) ◀── only published port                         (db: internal network only)
```

The frontend is a real, working product: sign in as the guest and you get a
dashboard, profile, payslip history, a working leave-request form, and your org
chart — all scoped to your own account.
