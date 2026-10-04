# Scrapline — CSRF via on-site redirect gadget (SameSite=Strict bypass)

A self-contained web CTF challenge modeled on the PortSwigger "Bypassing
SameSite restrictions using on-site gadgets" lab, re-skinned as a private
notes-sharing app.

## The vulnerability chain

Three separate weaknesses have to line up:

1. **`POST /notes/share`** grants another user access to one of your notes
   and has **no CSRF token**. The only thing standing between an attacker
   and forging it is the session cookie, which is set with
   **`SameSite=Strict`**.
2. **`GET /feedback/thanks`** is a public, unauthenticated confirmation page
   (reachable by anyone, no cookie needed) whose bundled JS
   (`static/js/confirm_redirect.js`) reads a `ref` query parameter and does
   a **client-side** redirect: `window.location = "/f/" + ref`, with no
   validation. Because browsers resolve `../` in a URL path the same way a
   filesystem collapses `..`, this becomes an open redirect to *any* path on
   the site.
3. **`/notes/share` also accepts `GET`** (via `request.values`, which merges
   query string and form body), so a plain navigation — which can't carry a
   request body — can still trigger the sensitive action.

Chained together: a cross-site top-level navigation to the public
confirmation page survives `SameSite=Strict` (the gadget needs no cookie to
load), and the client-side redirect it performs is itself same-site (it's
issued by code already running on the target), so *that* hop carries the
cookie regardless of the Strict setting.

## Flag location

The seeded `admin` account owns a note titled `internal-audit.txt`
containing the `FLAG` environment variable's value. Solving the challenge
means getting the admin's browser to add the attacker's account as a
collaborator on that note — after which the attacker just opens their own
`/notes` page to read it.

## Running it

```bash
docker compose up --build
```

- The app is served at `http://localhost:5000`.
- The `bot` service logs into `admin` and polls the `reports` table every
  few seconds, visiting any pending URL for ~4 seconds (long enough for the
  2.5s client-side redirect to fire) — this is what plays the part of "the
  admin clicking a reported link."

Set real values before a competition:

```bash
FLAG=SECURINETS{...}          # in docker-compose.yml, both services if bot needs it
ADMIN_PASSWORD=<random>       # same, both services
SECRET_KEY=<random hex>       # app service, for Flask session signing
```

## Intended solve path

1. Register an account, e.g. `hacker1`.
2. Notice `/notes/share` takes `note_id` + `username` and has no CSRF
   token; check `Set-Cookie` on `/login` and see `SameSite=Strict`.
3. Submit anything at `/feedback`, land on `/feedback/thanks?ref=<id>`,
   and notice the delayed client-side bounce to `/f/<ref>`. Pull up
   `static/js/confirm_redirect.js` and see it's unvalidated.
4. Test locally: `/feedback/thanks?ref=1/../../notes` redirects to
   `/notes` — confirms the traversal reaches arbitrary same-site paths.
5. In Burp Repeater, "Change request method" on `/notes/share` — confirm
   `GET` works identically to `POST`.
6. Build the final payload (note the `&` inside the payload must be
   percent-encoded as `%26` so it stays part of `ref` instead of being
   parsed as a second parameter of the *outer* `/feedback/thanks` request):

   ```
   https://<host>/feedback/thanks?ref=1/../../notes/share?note_id=1%26username=hacker1
   ```

   (`note_id=1` assumes the admin's flag note has id `1`, which it will on
   a fresh database — double check by registering, sharing a dummy note
   with yourself, and reading the id back if you change the seed data.)
7. Host that URL anywhere (a throwaway static page, a link shortener, your
   own exploit server) and submit it via `/report`.
8. Wait for the bot to visit it, then check your own `/notes` page — the
   admin's `internal-audit.txt` note (and the flag) is now shared with you.

## Adjusting difficulty

- **Easier:** point competitors at the confirmation page in a hint, or tell
  them the note id directly.
- **Harder:** nest the feedback route under an extra path segment so the
  traversal needs more `../`, or require a second parameter with its own
  encoding trap (mirroring the original lab's `submit=1`).

## Notes for maintainers

- Storage is SQLite behind a Docker volume shared between `app` and `bot`
  so the bot can read the `reports` queue directly. Fine for a single CTF
  instance; don't scale `app` to multiple replicas without moving to a real
  database, since SQLite's file locking won't hold up under concurrent
  writers across processes on different hosts.
- Nothing here is hardened for production use outside a CTF network — it's
  deliberately vulnerable by design.
