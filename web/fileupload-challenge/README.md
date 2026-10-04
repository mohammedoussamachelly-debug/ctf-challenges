# PaperTrail

A small internal **document portal**: upload PDFs / DOCX / TXT / MD, tag and
search them, add notes, and see storage stats and recent activity. Built as a
web-security challenge for **Securinets ENIT**.

> ⚠️ **Isolated lab / CTF use only.** This application is *intentionally
> vulnerable*. It allows remote code execution by design. Never expose it to
> the public internet or run it on a host you care about. Run it only inside a
> throwaway container on an isolated network. It makes no external network
> calls at runtime and contains no real user data.

---

## Run it

```bash
docker compose up --build -d
```

Then open <http://localhost:8080/>. Container port `80` is published to host
port `8080`.

Reset to a clean state (wipes all uploads and metadata):

```bash
docker compose down && docker compose up --build -d
```

## Player-facing description

> **PaperTrail** is our team's document portal. Upload your files, tag them,
> search the library, and keep track of what's been shared. Somewhere in here
> is a flag at `/flag.txt` on the server — see if you can reach it.

No security claims are made to the player; it is presented as an ordinary
line-of-business app.

## The challenge (author notes)

**Category:** Web · **Difficulty:** Medium

The intended flaw is a two-step *upload → RCE* chain:

1. **Blacklist upload filter.** The uploader (`src/api/upload.php`) rejects a
   fixed list of scriptable extensions (`php`, `php[2-7]`, `phps`, `pht`,
   `phtml`, `phar`, `cgi`, `pl`, `py`, `asp`, `aspx`, `jsp`, `sh`,
   case-insensitive) and does **no** content/MIME validation. It does *not*
   reject `.htaccess` or unlisted extensions like `.ptx`. Files are stored under
   their original name in `uploads/`.
2. **`.htaccess` → PHP.** The image is stock `php:8.2-apache` (mod_php) and
   `uploads/` is served with `AllowOverride All` (`apache/papertrail.conf`).
   Apache executes only `.php` by default, so a normal PHP shell can't be
   uploaded and any other file is served statically. The player uploads an
   `.htaccess` mapping an extension to PHP
   (`AddHandler application/x-httpd-php .ptx`), then uploads `shell.ptx` and
   gets code execution — enough to `cat /flag.txt`.

Step 2 is impossible without step 1: before the `.htaccess` is uploaded, no
non-`.php` extension is interpreted.

Full walkthrough and remediation: [`solution/SOLUTION.md`](solution/SOLUTION.md).
Helper that writes (and can fire) the exploit:
[`solution/make_exploit.sh`](solution/make_exploit.sh).

## Flag

`Securinets{wh3n_.htacc3ss_1s_upl04d4bl3_1ts_g4m3_0v3r}`

Defined once in [`flag.txt`](flag.txt) and copied to `/flag.txt` in the image —
edit that file and rebuild to change it.

## Layout

```
.
├── Dockerfile                 php:8.2-apache + app + flag
├── docker-compose.yml         port 80 -> 8080
├── flag.txt                   the flag (single source of truth)
├── apache/
│   └── papertrail.conf        AllowOverride All on uploads/ (enables the chain)
├── src/
│   ├── index.php              page shell (presentation only)
│   ├── lib/                    config, JSON store, helpers
│   ├── api/                    upload / list / document / download / delete
│   ├── assets/                 css, js, favicon
│   ├── uploads/                stored documents (www-data writable)
│   └── data/                   JSON metadata store (www-data writable)
└── solution/
    ├── make_exploit.sh
    └── SOLUTION.md
```

## Difficulty tuning

- **Easier:** shrink the blacklist further, or add a hint in the UI that
  `uploads/` allows per-directory configuration.
- **Harder — content check + polyglot (not built by default).** Add a
  `%PDF` magic-byte check that runs *only* for files whose extension is a known
  document type (so `.htaccess`, having no such extension, skips the check).
  The player must then remap `.pdf` → PHP via `.htaccess` **and** craft a
  polyglot: a file that starts with a real `%PDF-1.x` header (passing the
  content check) with PHP appended after it. This forces bypassing both a
  content check and the default handler, on top of the `.htaccess` step.
- **Harder — reduce feedback:** make the uploader return a generic error for
  all rejections so the blacklist can't be enumerated by response text.
```
