# meli-seller-os

`meli-seller-os` is a Cloudflare Worker for deliberately narrow Mercado Libre seller operations. It turns a configured product key into guarded Q&A answers, registry-defined attribute patches, and read-only moderation snapshots. It is designed for an operator-controlled workflow: the Worker prepares a short-lived receipt, a human supplies an exact approval phrase, and the Worker rechecks provider state before writing.

> **v0.1.1 is not a seller back office.** It does not create listings, schedule work, manage OAuth refresh tokens, or expose a Q&A inbox.

## Why this exists

Marketplace operations need both speed and a hard boundary around risky writes. This project keeps the write surface small, binds writes to a configured seller/item pair and current provider state, and records one-time progress in D1. It is useful when an operator already has the question text and ID from approved Mercado Libre tooling and wants a controlled prepare/approve/apply path.

## Operating principles
- **Registry first.** A product key resolves to a concrete seller, item, version, and target attributes.
- **Human approval is literal.** A receipt hash alone is insufficient; apply requests require the exact approval sentence.
- **Read, bind, then write.** Prepare captures current provider state; apply validates the receipt and reads the target again.
- **Fail closed.** Unknown provider shapes, state drift, invalid receipts, and uncertain outcomes do not become success.
- **One narrow adapter.** The production adapter can GET questions/items, POST an answer, and PUT item attributes. It has no listing-creation path.
- **Private runtime configuration may be real.** D1 and `PRODUCT_REGISTRY_JSON` may hold operator-authorized real seller/item IDs; only repository source, fixtures, examples, and public documentation are synthetic-only.

## Status at a glance
| Area | v0.1 status |
| --- | --- |
| Product registry | Implemented and configurable through D1, `PRODUCT_REGISTRY_JSON`, or bundled synthetic fallback |
| Internal bearer authentication | Implemented for `/internal/*` |
| Q&A polling and durable per-question dedupe | Implemented |
| Q&A prepare / exact approval / apply | Implemented |
| Registry-defined attribute patching | Implemented |
| Read-only moderation snapshots and change events | Implemented |
| Review/list endpoint or UI | **Not implemented** |
| OAuth token refresh or storage | **Not implemented** |
| Scheduler / cron polling | **Not implemented** |
| Listing creation, orders, shipping, or post-sale | **Not implemented** |
| Automatic moderation writes or reporting | **Not implemented** |
| RBAC | **Not implemented** |

## Architecture
```text
operator or trusted internal tool
            |
            | Bearer INTERNAL_TOKEN_PLACEHOLDER
            v
+---------------- Cloudflare Worker ----------------+
| public: GET /health                               |
| internal: authenticated route dispatcher           |
|                                                    |
| Service: registry -> receipt -> state validation   |
+-------------------+------------------+-------------+
                    |                  |
                    v                  v
          D1 (registry, receipts,   Marketplace adapter
          progress, snapshots)      (bounded GET/POST/PUT)
```

The Worker resolves product configuration in this order:

```text
exact product key or alias
  -> validated D1 product key or exact product_aliases row
  -> PRODUCT_REGISTRY_JSON binding
  -> bundled synthetic registry
  -> product_not_found
```

The D1 registry has priority. `PRODUCT_REGISTRY_JSON` may be either an array of product definitions or an object whose values are definitions. Definitions require:

```json
{
  "product_key": "demo_widget",
  "aliases": ["widget"],
  "seller_id": "10000001",
  "item_id": "TST100000001",
  "version": "v1",
  "attributes": [{"id": "BRAND", "value_name": "Example"}]
}
```

D1 aliases use exact equality; they do not use wildcard or `LIKE` semantics. `product_aliases` is the only D1 alias lookup source. `products.aliases_json` is deprecated compatibility storage and is ignored for runtime lookup. `config_json.aliases` is still required because a decoded definition must pass `validProduct`. D1 configuration is validated before use, but receipt bindings and the active registry are revalidated before a write.

### Bundled synthetic fallback

When neither a valid D1 row nor valid `PRODUCT_REGISTRY_JSON` resolves the key, the Worker falls back to the two bundled deterministic development definitions:

| Product key | Alias | Seller | Item |
| --- | --- | --- | --- |
| `demo_widget` | `widget` | `10000001` | `TST100000001` |
| `demo_gadget` | `gadget` | `10000002` | `TST100000002` |

This fallback exists for local development and tests. It is not a production inventory source. Configure D1 or `PRODUCT_REGISTRY_JSON` for real deployment; do not add real identifiers to this repository.

### Q&A flow

```text
external Mercado Libre tooling obtains question ID + question text
                         |
                         v
operator reviews the question and drafts exact answer text
                         |
                         v
GET questions/poll ----> D1 qa_seen (per product/question ID)
returns counts only       |
                         v
POST questions/prepare -> provider GET /questions/:id
                         -> classification + item/seller/state checks
                         -> signed 15-minute receipt
                         |
operator verifies text and sends exact approval phrase
                         |
                         v
POST questions/apply ---> revalidate receipt + current question
                         -> claim once in D1
                         -> provider POST /answers
                         -> read back question
                         -> answered | outcome_unknown | rejected
```

`GET .../questions/poll` deliberately returns only counts. It does **not** return question text, question IDs, or a review queue. v0.1 also has no list/review endpoint and no UI. Before calling `questions/prepare`, the operator must obtain the question ID and text through external Mercado Libre tooling.

### Attribute flow

```text
POST attributes/prepare -> provider GET /items/:id
                         -> bind item state + registry target in receipt
                         -> signed 15-minute receipt
                         |
operator verifies the planned registry attributes
                         |
POST attributes/apply ---> revalidate receipt + current item state
                         -> claim once in D1
                         -> provider PUT /items/:id {attributes}
                         -> item readback
                         -> completed | verification_pending
```

### Moderation flow

```text
GET moderation/poll -> provider GET /items/:id
                    -> project status/sub_status/non_selling_reason
                    -> hash and store snapshot/event in D1
                    -> return changed flag and snapshot
```

Moderation polling is read-only. It does not report content to Mercado Libre, change moderation state, or write a marketplace listing.

## Implemented HTTP API
Base URL in examples: `https://example.test`. Internal endpoints require this header:

```http
Authorization: Bearer INTERNAL_TOKEN_PLACEHOLDER
```

Responses use JSON and `Cache-Control: no-store`. `/health` is the only public route. Error taxonomy: unknown route `404 not_found`; unauthenticated internal request `401 unauthorized`; invalid method, invalid JSON, `null`, array, missing field, or non-string required field `400 invalid_request`; unknown configured product `404`; a valid request rejected by stale/unsafe/receipt-conflict state `409`; malformed provider projection `502 unknown_shape`; provider 4xx/unexpected transport error `502 upstream_unavailable`; provider 429/5xx or unavailable OAuth/receipt key `503 upstream_unavailable` (or a `503` service result).

| Status | Method and route | Request contract | Success/result contract | Marketplace effect |
| --- | --- | --- | --- | --- |
| Implemented | `GET /health` | None | `200 {"ok":true,"service":"meli-seller-os"}` | None |
| Implemented | `GET /internal/products/:productKey/questions/poll` | Auth header; no body | `200 {"created":number,"deduped":number,"moderated":number}` or `404 {"error":"product_not_found"}` | GET question search only |
| Implemented | `POST /internal/products/:productKey/questions/prepare` | Auth header; JSON `{"id":string,"text":string}` | `{"ok":true,"receipt":{"receipt_id":string,"hash":string,"expires_at":number}}`; or `{"ok":false,"reason":"product_not_found"|"safe_review_required"|"receipt_key_unavailable"}` | GET one question |
| Implemented | `POST /internal/products/:productKey/questions/apply` | Auth header; JSON with `id`, `receipt_id`, `text`, `hash`, `approval`. A valid apply needs all values to match the prepared receipt. | `{"status":"answered"}`; `{"status":"outcome_unknown"}`; or `{"status":"rejected","reason":"receipt_integrity_mismatch"|"question_changed"}` | At most one POST answer per receipt; then question readback |
| Implemented | `POST /internal/products/:productKey/attributes/prepare` | Auth header; JSON body is parsed but has no required fields | `{"ok":true,"receipt":{"receipt_id":string,"hash":string,"expires_at":number}}`; or `{"ok":false,"reason":"product_not_found"|"state_drift"|"receipt_key_unavailable"}` | GET one item |
| Implemented | `POST /internal/products/:productKey/attributes/apply` | Auth header; JSON `{"receipt_id":string,"hash":string,"approval":string}`. Values must match the prepared receipt. | `{"status":"completed"}`; `{"status":"verification_pending"}`; or `{"status":"verification_pending","reason":"receipt_binding_mismatch"|"state_drift"}` | At most one PUT attributes per receipt; then item readback |
| Implemented | `GET /internal/products/:productKey/moderation/poll` | Auth header; no body | `{"changed":boolean,"snapshot":{"id":string,"status":string,"sub_status":string[],"non_selling_reason":string|null},"prior_digest":string|null}`. When unchanged, response is `{"changed":false,"snapshot":...}`. Unknown product returns `{"error":"product_not_found"}`; invalid projected shape returns `{"error":"unknown_shape"}`. | GET one item |

`:productKey` is URL-decoded and can be the configured `product_key` or an exact configured alias.

### Q&A classifier contract

The classifier emits exactly these categories:

| Category | Meaning in v0.1 | Prepare behavior |
| --- | --- | --- |
| `provider_moderated` | Provider marks the question as suspected spam or uses `BANNED`, `DELETED`, or `DISABLED` status | Blocked: `safe_review_required` |
| `abuse_threat` | Matches threat terms | Blocked: `safe_review_required` |
| `abuse_harassment` | Matches harassment terms | Blocked: `safe_review_required` |
| `spam_phishing` | Matches credential language combined with a URL/domain pattern | Blocked: `safe_review_required` |
| `spam_promotion` | Matches defined promotion terms | Blocked: `safe_review_required` |
| `needs_moderation_review` | Matches suspicious airdrop/crypto patterns | Blocked: `safe_review_required` |
| `off_platform` | Matches defined off-platform contact/payment terms | Not blocked by this classifier; operator still owns content quality |
| `factual` | All other text | Eligible for prepare if all state checks pass |

There is **no durable cross-question `spam_repetition` classifier** in v0.1. Polling persists a normalized text hash for each `(product_key, question_id)` to support per-question deduplication, not cross-question repetition detection. `questions/poll` increments `moderated` for blocked classifications and `created` for all others, including `off_platform`.

### Exact approvals and receipts

A successful prepare returns a receipt ID, approval hash, and epoch-millisecond expiration. Receipts expire 15 minutes after preparation. The receipt HMAC is derived server-side from `RECEIPT_ROOT_KEY` with HKDF-SHA-256 and is never returned.

For Q&A apply, `approval` must be exactly:

```text
OK responder pregunta <question_id> con hash <approval_hash>
```

For attributes apply, `approval` must be exactly:

```text
OK aplicar atributos <item_id> con hash <approval_hash>
```

A re-used successful answer receipt returns `answered` without another answer write. A concurrent, ambiguous, failed, or unreadable answer outcome returns `outcome_unknown`, requiring external investigation before any further action. A completed attribute receipt returns `completed` without another PUT; any conflicting, uncertain, or state-drift path is `verification_pending`.

## Quickstart
### Prerequisites

- Node.js `>=20.0.0` and npm `>=10.0.0`
- A Cloudflare account with D1 access and Wrangler authentication
- A private source for `INTERNAL_AUTH_TOKEN`, `RECEIPT_ROOT_KEY`, and, when using the real marketplace adapter, `MELI_ACCESS_TOKEN`

### 1. Clone and install

```sh
git clone https://github.com/ctala/meli-seller-os.git
cd meli-seller-os
npm ci
```

### 2. Create D1 and configure Wrangler

Create a D1 database with Wrangler, then copy the generated D1 database UUID into `wrangler.toml`:

```sh
npx wrangler d1 create meli-seller-os
cp wrangler.example.toml wrangler.toml
```

`wrangler.example.toml` contains the literal placeholder `REPLACE_WITH_D1_DATABASE_UUID`. The checked-in `wrangler.toml` contains the all-zero placeholder UUID. Both are intentionally rejected by the predeploy validator. Replace the placeholder with the D1 UUID returned by Wrangler before deployment.

This release contains exactly these migrations, in order:

1. `0001_initial.sql`
2. `0002_product_aliases_canonical.sql`

Apply every pending numbered migration to the intended D1 database, then confirm that none remain:

```sh
npx wrangler d1 migrations list meli-seller-os --remote
npx wrangler d1 migrations apply meli-seller-os --remote
npx wrangler d1 migrations list meli-seller-os --remote
npm run migrations:verify
```

The final `list` should report no pending migrations and its applied history should include `0001_initial.sql` followed by `0002_product_aliases_canonical.sql`. The repository verifier performs a SQLite fresh-schema and raw-reapplication check; it is not a migration-history ledger. Do not manually re-run raw migration SQL against an existing database outside your migration process.

### 3. Set Worker secrets

Never put secrets in `wrangler.toml`, README examples, commands saved in shell history, commits, or issue text. Enter each value through a hidden interactive prompt and pipe it to Wrangler without placing the value in argv:

```sh
read -rsp 'Internal auth token: ' SECRET_VALUE; echo
printf '%s' "$SECRET_VALUE" | npx wrangler secret put INTERNAL_AUTH_TOKEN
unset SECRET_VALUE

read -rsp 'Receipt root key: ' SECRET_VALUE; echo
printf '%s' "$SECRET_VALUE" | npx wrangler secret put RECEIPT_ROOT_KEY
unset SECRET_VALUE

read -rsp 'Mercado Libre access token: ' SECRET_VALUE; echo
printf '%s' "$SECRET_VALUE" | npx wrangler secret put MELI_ACCESS_TOKEN
unset SECRET_VALUE
```

`RECEIPT_ROOT_KEY` must be a 32-byte base64url value (43 unpadded base64url characters). `MELI_ACCESS_TOKEN` is optional only if a different adapter is injected for tests; production `HttpMarketplaceAdapter` needs it for marketplace reads and permitted writes. v0.1 does not refresh or store OAuth tokens.

For local development, use ignored local files such as `.dev.vars` rather than committing credentials. The required ignore rules are present in `.gitignore`; `.env.example` remains trackable as a safe template.

### 4. Configure the registry

Prefer D1 for persistent configuration. Insert one product row plus each exact alias in `product_aliases`; `config_json.aliases` must also be present and valid even though lookup ignores it. The Worker overlays `product_key`, `seller_id`, and `item_id` from the row over the decoded config.

```sql
INSERT INTO products (product_key, seller_id, item_id, aliases_json, config_json)
VALUES (
  'PRODUCT_KEY_PLACEHOLDER', 'SELLER_ID_PLACEHOLDER', 'ITEM_ID_PLACEHOLDER', '[]',
  '{"aliases":["ALIAS_PLACEHOLDER"],"version":"v1","attributes":[{"id":"BRAND","value_name":"VALUE_PLACEHOLDER"}]}'
);
INSERT INTO product_aliases (alias, product_key)
VALUES ('ALIAS_PLACEHOLDER', 'PRODUCT_KEY_PLACEHOLDER');
```

`aliases_json` is deprecated and ignored by runtime lookup. Keep `config_json.aliases` coherent with the inserted `product_aliases` rows so validation and operator configuration describe the same aliases.

Verify the effective D1 product/alias rows before using a write-capable route:

```sh
npx wrangler d1 execute meli-seller-os --remote --command \
  "SELECT p.product_key,p.seller_id,p.item_id,a.alias FROM products p LEFT JOIN product_aliases a ON a.product_key=p.product_key WHERE p.product_key='PRODUCT_KEY_PLACEHOLDER' ORDER BY a.alias"
```

The product row is authoritative. A matching but malformed D1 row fails closed; it does not silently fall through to environment or bundled definitions.

For a small deployment, set `PRODUCT_REGISTRY_JSON` as a Worker variable/binding containing a JSON array or object of definitions following the schema shown above. Treat it as a **secret** when it contains real seller or item identifiers; use a normal Worker variable only when the complete registry is intentionally non-sensitive. For example:

```sh
printf '%s' '[{"product_key":"PRODUCT_KEY_PLACEHOLDER","aliases":["ALIAS_PLACEHOLDER"],"seller_id":"SELLER_ID_PLACEHOLDER","item_id":"ITEM_ID_PLACEHOLDER","version":"v1","attributes":[{"id":"BRAND","value_name":"VALUE_PLACEHOLDER"}]}]' | npx wrangler secret put PRODUCT_REGISTRY_JSON
```

`PRODUCT_REGISTRY_JSON` may contain real operator-authorized IDs and therefore belongs in private Worker configuration, never in this repository. It is a real configuration mechanism, not a roadmap item. Keep real identifiers out of public source control and use D1 or your organization’s managed configuration path appropriately.

If neither source resolves a key, the Worker uses the bundled synthetic fallback described earlier. Do not rely on fallback entries for production operations.

### 5. Validate and deploy

Run the release gates before deploy:

```sh
npm test
npm run check
npm run openspec:validate
npm run migrations:verify
npm run dry-run
npm audit --all
npm audit --omit=dev
npm pack --dry-run
```

`npm run dry-run` runs `node scripts/predeploy-validate.mjs` before `wrangler deploy --dry-run`. It must fail while `wrangler.toml` has either documented D1 placeholder. This failure is expected before the UUID is replaced; it is not a successful deployment dry run.

Use separate Wrangler config files and D1 databases for local, staging, and production. The examples below use an explicit config path so migrations, secrets, deploy, and readback target the same environment:

```sh
WRANGLER_CONFIG=wrangler.production.toml
D1_NAME=meli-seller-os-production

npx wrangler d1 migrations apply "$D1_NAME" --remote --config "$WRANGLER_CONFIG"
npx wrangler deploy --config "$WRANGLER_CONFIG"
npx wrangler deployments list --config "$WRANGLER_CONFIG"
```

After deploy, copy the Worker URL printed by Wrangler and run bounded readbacks:

```sh
WORKER_URL='https://worker.example.test'
curl --fail-with-body "$WORKER_URL/health"

read -rsp 'Internal auth token: ' INTERNAL_TOKEN; echo
curl --fail-with-body \
  -H "Authorization: Bearer $INTERNAL_TOKEN" \
  "$WORKER_URL/internal/products/PRODUCT_KEY_PLACEHOLDER/moderation/poll"
unset INTERNAL_TOKEN
```

`/health` proves only that the route responds. The authenticated moderation readback proves that the deployed Worker can resolve the selected registry entry, access the intended D1 binding, obtain an access token, call Mercado Libre, and validate the bounded provider shape. Do not start scheduled polling until both checks pass in the intended environment.

## Synthetic curl walkthrough

These requests show wire contracts only. They use `example.test`, synthetic product data, and literal placeholders. Do not paste production values into shell history.

Health is public:

```sh
curl --fail-with-body https://example.test/health
```

Poll Q&A. The response contains counts, never question IDs or text:

```sh
curl --fail-with-body \
  -H 'Authorization: Bearer INTERNAL_TOKEN_PLACEHOLDER' \
  https://example.test/internal/products/demo_widget/questions/poll
```

After retrieving the question ID and text from external Mercado Libre tooling, prepare an answer. In both Q&A `prepare` and `apply`, `text` is the exact proposed **answer**, not the question text; the Worker rereads the question internally and binds its digest:

```sh
curl --fail-with-body -X POST \
  -H 'Authorization: Bearer INTERNAL_TOKEN_PLACEHOLDER' \
  -H 'Content-Type: application/json' \
  --data '{"id":"QUESTION_ID_PLACEHOLDER","text":"Yes, the example item is available."}' \
  https://example.test/internal/products/demo_widget/questions/prepare
```

Use the returned receipt values unchanged. The approval phrase below is a template; substitute the returned hash and the external question ID exactly:

```sh
curl --fail-with-body -X POST \
  -H 'Authorization: Bearer INTERNAL_TOKEN_PLACEHOLDER' \
  -H 'Content-Type: application/json' \
  --data '{"id":"QUESTION_ID_PLACEHOLDER","receipt_id":"RECEIPT_ID_PLACEHOLDER","text":"Yes, the example item is available.","hash":"APPROVAL_HASH_PLACEHOLDER","approval":"OK responder pregunta QUESTION_ID_PLACEHOLDER con hash APPROVAL_HASH_PLACEHOLDER"}' \
  https://example.test/internal/products/demo_widget/questions/apply
```

Prepare an attribute patch. Its target is the configured registry attributes, not request-supplied attributes:

```sh
curl --fail-with-body -X POST \
  -H 'Authorization: Bearer INTERNAL_TOKEN_PLACEHOLDER' \
  -H 'Content-Type: application/json' \
  --data '{}' \
  https://example.test/internal/products/demo_widget/attributes/prepare
```

Apply the prepared patch using the exact item ID and returned hash:

```sh
curl --fail-with-body -X POST \
  -H 'Authorization: Bearer INTERNAL_TOKEN_PLACEHOLDER' \
  -H 'Content-Type: application/json' \
  --data '{"receipt_id":"RECEIPT_ID_PLACEHOLDER","hash":"APPROVAL_HASH_PLACEHOLDER","approval":"OK aplicar atributos TST100000001 con hash APPROVAL_HASH_PLACEHOLDER"}' \
  https://example.test/internal/products/demo_widget/attributes/apply
```

Poll moderation without making a marketplace write:

```sh
curl --fail-with-body \
  -H 'Authorization: Bearer INTERNAL_TOKEN_PLACEHOLDER' \
  https://example.test/internal/products/demo_widget/moderation/poll
```

## D1 data model
The fresh migration creates the following tables:

| Table | Purpose |
| --- | --- |
| `products` | Configured product key, seller/item identity, deprecated/ignored `aliases_json`, and product config JSON |
| `product_aliases` | The sole exact alias-to-product lookup source |
| `qa_seen` | Per-product, per-question poll dedupe, normalized text hash, and classification |
| `qa_receipts` / `qa_progress` | Signed Q&A receipt and monotonic answer progress |
| `patch_receipts` / `patch_progress` | Signed attribute receipt and monotonic patch progress |
| `moderation_snapshots` / `moderation_events` | Content-addressed read-only moderation observations and changes |

D1 is durable coordination state, not unconditional authority. The service treats decoded receipt rows as hostile input: it rechecks HMAC, receipt binding, active registry identity, approval hash, expiration, current question/item state, and provider readback before declaring a write successful.

## Security and threat model
### Assets and trust boundaries

| Asset / boundary | Control |
| --- | --- |
| Internal API access | Constant-time comparison of an `Authorization: Bearer` token; all `/internal/*` routes fail closed when `INTERNAL_AUTH_TOKEN` is missing or wrong |
| Receipt integrity | Canonical JSON, SHA-256 approval hash, and an HKDF-SHA-256-derived HMAC from server-only `RECEIPT_ROOT_KEY` |
| Seller and item targeting | Registry lookup plus item/seller checks during prepare and apply |
| Provider state changes | Q&A must remain unanswered with the same text digest; attribute patch must retain the prepared allowlisted item-state projection digest over `id`, `seller_id`, `status`, and `attributes` |
| Duplicate writes | D1 progress claims and monotonic terminal states; each apply performs at most one marketplace write for a receipt |
| Provider schema drift | Question/item/moderation data are projected and validated; malformed moderation shape fails closed |
| Sensitive data in the repository | Public scanner checks worktree, staged blobs, hidden environment files, Git objects, and `npm pack --dry-run` surface |

### Threats handled

- **Stale or modified question:** rejected as `question_changed` before answering.
- **Receipt tampering, wrong product, wrong target, wrong text, wrong approval, or expiration:** rejected (`receipt_integrity_mismatch` for Q&A; `receipt_binding_mismatch` / `verification_pending` for attributes).
- **Concurrent or replayed apply:** progress rows prevent a second marketplace write.
- **Uncertain upstream outcome:** answer flow returns and persists `outcome_unknown`; attribute flow returns and persists `verification_pending`.
- **Unexpected moderation response:** returns `unknown_shape` rather than persisting a partial interpretation.
- **Unwanted listing creation:** no POST `/items` route or adapter method exists.

### Out of scope security controls

v0.1 does not implement RBAC, identity federation, rate limiting, audit-log export, OAuth refresh/storage, a secret manager integration, a scheduler, automatic moderation reporting, or a review UI. Internal bearer authentication is a shared-token boundary, not multi-user authorization.

Treat operator tooling and its access to question text/IDs as a separate trust boundary. The Q&A poll endpoint cannot serve as a queue or content review source.

## Testing and release gates
The project scripts are defined in `package.json`:

| Command | What it runs |
| --- | --- |
| `npm test` | `vitest run` unit and end-to-end service tests |
| `npm run check` | TypeScript no-emit check, then the public surface scanner |
| `npm run scan` | Public scanner directly |
| `npm run openspec:validate` | Strict validation of `v0.1-meli-seller-os` OpenSpec change |
| `npm run migrations:verify` | Fresh-schema and raw-reapplication check using SQLite |
| `npm run predeploy` | D1 placeholder validation only |
| `npm run dry-run` | Predeploy validation, then `wrangler deploy --dry-run` |

Recommended release sequence:

```sh
npm ci
npm test
npm run check
npm run openspec:validate
npm run migrations:verify
npm run dry-run
npm audit --all
npm audit --omit=dev
npm pack --dry-run
```

Do not waive an expected placeholder failure as a deployment pass. Configure D1 first, then rerun `npm run predeploy` and `npm run dry-run`. Review both audit commands separately because development dependencies and production dependencies have different surfaces.

## Not implemented / roadmap

These are explicit non-features of v0.1, not hidden behavior:

- OAuth authorization flow, refresh, secure token storage, or token rotation.
- Scheduled polling, cron triggers, webhooks, or background queues.
- Listing creation or publication; inventory, price, or listing-content management beyond configured attribute patches.
- Orders, fulfillment, shipping, returns, claims, messages, or post-sale workflows.
- A Q&A review/list endpoint, question-text endpoint, operator dashboard, or UI.
- Durable cross-question `spam_repetition` detection.
- Automated moderation writes, reports, appeals, or enforcement actions.
- RBAC, per-user identities, roles, permissions, or tenant isolation.
- General-purpose registry administration API. The registry itself is configurable through D1 or `PRODUCT_REGISTRY_JSON`; configuration APIs are simply not part of v0.1.

Future work should preserve the current prepare/approve/apply boundary and fail-closed handling rather than bypassing it for convenience.

## Known limits

- The classifier is deterministic keyword/pattern matching, not semantic moderation or policy enforcement.
- `off_platform` is classified but not automatically blocked by the current `blocked` decision; an operator must evaluate the response content.
- Poll counts represent the current adapter result processed against durable `(product_key, question_id)` state. They are not a complete marketplace inbox or historical report.
- Q&A uncertain outcomes should be reconciled through approved external tooling; retrying blindly is intentionally prevented.
- Attribute patch targets are registry-defined. Request bodies cannot choose arbitrary attributes.
- First moderation observation is reported as a change because it creates the initial event; unchanged later snapshots return `changed:false`.
- The bundled registry and repository examples are intentionally synthetic and cannot operate a real seller account.
- The Worker depends on current provider response shapes and fails closed when its expected projection is not available.

## Operational limits, retention, and observability assumptions

- **Rate limits:** v0.1 does not impose application rate limits, quotas, retries, backoff, or scheduler cadence. Mercado Libre and Cloudflare limits apply; callers must rate-limit their own authenticated internal requests.
- **Retention:** D1 rows (`qa_seen`, receipts/progress, moderation snapshots/events) have no automatic TTL or deletion job in v0.1. Retention is the D1 database/operator policy, not an application guarantee.
- **Observability:** there is no metrics export, tracing, audit-log export, alerting, review queue, or dashboard. `/health` only confirms that the Worker route responds; it does not prove D1, OAuth, or Mercado Libre availability.
- **Taxonomy:** the Q&A classifier emits only `provider_moderated`, `abuse_threat`, `abuse_harassment`, `spam_phishing`, `spam_promotion`, `needs_moderation_review`, `off_platform`, and `factual`. `spam_repetition` is not emitted or blocked.
- **Digest scope:** an attribute receipt uses an **allowlisted item-state projection digest** over exactly `id`, `seller_id`, `status`, and `attributes`. It does not claim to bind full item state, price, title, or condition.
- **Comparison timing:** secret/string comparison has equal-length timing behavior only; it does not claim equal timing for unequal-length inputs.

## Operations, reconciliation, and privacy

### Post-deploy check

Use the deployed URL and the intended environment's credentials. First call `GET /health`; it only confirms the route. Then make one bounded authenticated `questions/poll` or `moderation/poll` request for a configured synthetic/safe product and inspect the JSON response. Do not treat health as proof of D1, OAuth, or Mercado Libre availability, and do not loop or schedule requests from this Worker.

Each Wrangler environment can bind a different D1 database and has its own Worker secrets. Apply migrations and registry changes to the same selected environment; a local or staging D1 is not production. Rotating `INTERNAL_AUTH_TOKEN` immediately invalidates callers using the old token. Rotating `RECEIPT_ROOT_KEY` invalidates outstanding prepared receipts because their HMAC cannot be verified; wait for the 15-minute receipt window or explicitly reconcile outstanding work before rotation. Rotate the external access token through its external OAuth process.

### Receipts, approvals, and reconciliation

`receipt_id` identifies a stored preparation. `approval_hash` (returned as `hash`) is the SHA-256 binding used in the exact approval sentence; it is not the secret HMAC and is not approval by itself. In Q&A prepare/apply, `text` is always the exact proposed **answer**. The Worker fetches the provider question text internally and binds its digest; clients must not put question text in `text`.

If Q&A returns `outcome_unknown`, do not resend apply. Use approved Mercado Libre tooling to inspect that question's answer state, then inspect `qa_progress` and the matching receipt in D1. If an attribute patch returns `verification_pending`, inspect the item attributes through approved tooling and the matching `patch_progress` receipt; do not blindly retry the PUT. After confirming the provider outcome, make a documented operator decision for the receipt rather than assuming the Worker can safely infer it.

Safe, minimal D1 inspection queries (run only in the intended private environment) are:

```sql
SELECT receipt_id, expires_at FROM qa_receipts ORDER BY expires_at DESC LIMIT 20;
SELECT receipt_id, status, updated_at FROM qa_progress ORDER BY updated_at DESC LIMIT 20;
SELECT receipt_id, status, updated_at FROM patch_progress ORDER BY updated_at DESC LIMIT 20;
```

Execute them against the same database/config used for deploy, for example:

```sh
npx wrangler d1 execute "$D1_NAME" --remote --config "$WRANGLER_CONFIG" --command \
  "SELECT receipt_id,status,updated_at FROM qa_progress ORDER BY updated_at DESC LIMIT 20"

npx wrangler d1 execute "$D1_NAME" --remote --config "$WRANGLER_CONFIG" --command \
  "SELECT receipt_id,status,updated_at FROM patch_progress ORDER BY updated_at DESC LIMIT 20"
```

Correlate by the opaque `receipt_id` returned by prepare/apply. Do not select or export `payload_json` or `mac`; those fields are not needed for routine reconciliation.

Avoid exporting `payload_json`, question content, authorization headers, or receipt MACs into tickets and logs. Retention is operator-controlled: D1 has no automatic purge. Define a retention window, back up only what policy permits, and delete/anonymize coordination rows under the applicable privacy policy after an incident or retention expiry.

### Registry bootstrap transaction

Use a transaction so a product and its aliases change together; aliases are exact and must not collide with any `product_key`. Substitute private values outside source control:

```sql
BEGIN IMMEDIATE;
INSERT INTO products (product_key, seller_id, item_id, aliases_json, config_json)
VALUES ('PRODUCT_KEY_PLACEHOLDER','SELLER_ID_PLACEHOLDER','ITEM_ID_PLACEHOLDER','[]','{"aliases":["ALIAS_PLACEHOLDER"],"version":"v1","attributes":[]}')
ON CONFLICT(product_key) DO UPDATE SET seller_id=excluded.seller_id,item_id=excluded.item_id,config_json=excluded.config_json;
DELETE FROM product_aliases WHERE product_key='PRODUCT_KEY_PLACEHOLDER';
INSERT INTO product_aliases (alias, product_key) VALUES ('ALIAS_PLACEHOLDER','PRODUCT_KEY_PLACEHOLDER');
COMMIT;
```

A D1 row matching the requested product key or alias is authoritative: if it is malformed or incoherent, resolution fails closed and does not fall back to `PRODUCT_REGISTRY_JSON` or the bundled registry. If no D1 row matches, later sources may resolve the key. Exact product-key lookup precedes exact alias lookup; no `LIKE`, wildcard, `OR ... LIMIT 1`, or arbitrary-row resolution is used.

### Audit and errors

The scanner treats secrets, real identifiers, non-allowlisted domains, personal data, receipts, hidden environment files, alternate write paths, reachable historical blobs, staged blobs, and package contents as release-blocking HIGH findings. Synthetic examples and dependency lock metadata are excluded only where they are structurally required test/package metadata. `400` means malformed request, `401` authentication failed, `404` route/product absent, `409` safe-state/receipt conflict, `502` unexpected provider shape or non-retryable upstream failure, and `503` unavailable OAuth/receipt key or provider 429/5xx. There is no built-in rate limit, retry, metrics, or alerting; callers must bound requests and record their own operational observations.

### OAuth and access tokens

OAuth authorization-code acquisition, refresh, storage, and rotation are external to v0.1.1. Obtain and manage access tokens only through Mercado Libre's official documentation: <https://developers.mercadolibre.com.ar/es_ar/autenticacion-y-autorizacion> and <https://developers.mercadolibre.com.ar/es_ar/gestiona-tus-aplicaciones>. Never paste a production token into repository files, examples, shell history, or support tickets.

## Contributing

Use only synthetic fixtures, `example.test`, placeholders, and test IDs. Never commit secrets, production seller/item IDs, customer or buyer content, personal data, real marketplace receipts, or token-bearing configuration.

Keep marketplace writes confined to `HttpMarketplaceAdapter`; do not add a listing creation path. For changes that affect behavior or documentation, run the release gates above and include the relevant output in review. See `CONTRIBUTING.md` for the concise contributor policy.

## License

MIT. See `LICENSE`.
