# SOLUTION — Scrapline  🚩 SPOILERS

> Keep this away from players. Full intended solve and flag below.

**Flag:** `SECURINETS{redirect_gadget_beats_samesite_strict}`

**Bug class:** CSRF on a sensitive state-changing action, with the
`SameSite=Strict` session cookie bypassed via an on-site open-redirect
gadget (modeled on the PortSwigger "Bypassing SameSite restrictions using
on-site gadgets" lab).

---

## The three weaknesses that chain

1. **`POST /notes/share` has no CSRF token.** It grants another user
   collaborator access to one of your notes. The only protection is the
   session cookie, set with `SameSite=Strict`.
2. **`GET /feedback/thanks` is public (no cookie needed)** and its bundled
   JS (`static/js/confirm_redirect.js`) reads the `ref` query parameter and
   does a *client-side* redirect `window.location = "/f/" + ref` with no
   validation. Browsers collapse `../` in a URL path, so this is an open
   redirect to any same-site path.
3. **`/notes/share` also accepts `GET`** (the handler uses
   `request.values`, merging query string + form body), so a plain
   top-level navigation — which carries no request body — still triggers the
   sensitive action.

Chaining them: a cross-site top-level navigation to the public confirmation
page survives `SameSite=Strict` (the gadget loads with no cookie). The
client-side redirect it then performs is *same-site* (issued by code already
running on the target origin), so that hop **does** carry the session cookie
regardless of Strict.

---

## Step-by-step

1. **Register** an attacker account, e.g. `hacker1`.
2. **Recon the sink.** `POST /notes/share` takes `note_id` + `username` and
   ships no CSRF token. Check `Set-Cookie` on `/login` — `SameSite=Strict`.
3. **Find the gadget.** Submit anything at `/feedback`, land on
   `/feedback/thanks?ref=<id>`, and watch the ~2.5s client-side bounce to
   `/f/<ref>`. Read `static/js/confirm_redirect.js`: the redirect is
   unvalidated.
4. **Confirm the traversal.** `/feedback/thanks?ref=1/../../notes`
   redirects to `/notes` — arbitrary same-site paths are reachable.
5. **Confirm GET works** on `/notes/share` (Burp → "Change request
   method", or just navigate).
6. **Build the payload.** The inner `&` must be percent-encoded as `%26` so
   it stays part of `ref` instead of being parsed as a second parameter of
   the outer `/feedback/thanks` request:

   ```
   https://<host>/feedback/thanks?ref=1/../../notes/share?note_id=1%26username=hacker1
   ```

   `note_id=1` is the admin's `internal-audit.txt` note on a fresh
   database.
7. **Deliver.** Host that URL anywhere (throwaway page / link shortener /
   exploit server) and submit it via `/report`.
8. **Collect.** The bot (logged in as `admin`) visits the reported URL; the
   client-side redirect fires the authenticated `GET /notes/share`, adding
   `hacker1` as a collaborator. Open your own `/notes` page — the admin's
   `internal-audit.txt` note, containing the flag, is now shared with you.

---

## Flag location

The seeded `admin` account owns a note titled `internal-audit.txt` holding
the value of the `FLAG` environment variable
(`SECURINETS{redirect_gadget_beats_samesite_strict}` in the shipped
`docker-compose.yml`). Set a fresh `FLAG`, `ADMIN_PASSWORD` and `SECRET_KEY`
before any real competition.
