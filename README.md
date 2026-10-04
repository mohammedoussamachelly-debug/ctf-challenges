# CTF Challenges

A curated collection of CTF challenges, organized by category. Flags follow
the `Securinets{...}` / `SecurinetsEnit{...}` format.

## 📂 Categories

- [`web/`](web/) — web application security challenges
- [`forensics/`](forensics/) — digital forensics challenges

---

## 🌐 Web

| Challenge | Bug class | Difficulty | Stack |
|---|---|---|---|
| [nimbus-people-cloud](web/nimbus-people-cloud/) | Broken Object-Level Authorization (BOLA/IDOR) via GraphQL introspection | Easy–Medium | Node + Apollo + Postgres |
| [vantage-ctf](web/vantage-ctf/) | UNION-based SQL injection (with a bypassable WAF) | Medium | Flask + PostgreSQL |
| [fileupload-challenge](web/fileupload-challenge/) (PaperTrail) | Unrestricted file upload → RCE via `.htaccess` | Medium | PHP + Apache |
| [scrapline-ctf-challenge](web/scrapline-ctf-challenge/) | CSRF + on-site redirect gadget bypassing `SameSite=Strict` | Medium–Hard | Flask + headless admin bot |

Each web challenge ships with a `docker compose up --build` setup, a
player-facing `README.md`, and a `SOLUTION.md` (intended solve + flag).

## 🔍 Forensics

| Challenge | Category | Flag format |
|---|---|---|
| [challenge1_FIJIBI](forensics/challenge1_FIJIBI/) | Audio forensics — hidden data in voice notes | `SecurinetsEnit{...}` |

---

## 🎯 How to use

1. **Browse** to a challenge directory and read its `README.md`.
2. **Run / download** the challenge (web challenges: `docker compose up --build`).
3. **Solve** it with your own tooling (Burp, curl, Wireshark, Audacity, …).
4. **Check `SOLUTION.md`** (web challenges) only if you're stuck or operating
   the challenge — it contains the flag.

Difficulty levels: **Easy** | **Medium** | **Hard**

---

**Good luck!** 🔐  For questions or feedback, open an issue.
