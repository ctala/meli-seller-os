## Context

The Worker separates marketplace transport, receipt-bound service logic, and D1 persistence. It may operate on operator-authorized real seller/item identities only through private D1 or `PRODUCT_REGISTRY_JSON`; repository fixtures/examples/docs remain synthetic-only.

## Goals / Non-Goals

**Goals:**
- Keep D1/JSON configuration an exact allowlist rather than marketplace discovery.
- Make `product_aliases` the canonical exact alias source while retaining validated `config_json.aliases`.
- Bind writes to bounded provider projections and map malformed input/service failures coherently.
- Verify public package surfaces without exposing private runtime values.

**Non-Goals:**
- Creating listings, OAuth refresh, scheduler jobs, marketplace moderation writes, application rate limiting, retention cleanup, or observability export.
- Storing real IDs in the repository.
- Claiming a full item-state digest from a bounded projection.

## Decisions

### Private configuration, synthetic public source
D1 and `PRODUCT_REGISTRY_JSON` are private operator configuration and can contain real authorized seller/item IDs. The scanner and contributor policy apply synthetic-only constraints to repository/public artifacts, not runtime configuration.

### Canonical aliases
The SQL lookup uses `products.product_key = ? OR product_aliases.alias = ?` with exact equality. `products.aliases_json` is ignored compatibility storage; migration `0002` documents the transition and adds a safe alias index. `config_json.aliases` is still validated to preserve one coherent product definition.

### Bounded patch projection
The patch receipt hashes only `{id, seller_id, status, attributes}`. This detects drift in fields the patch contract uses, but intentionally does not promise protection for price, title, condition, or full item state.

### Router boundary
The router parses and validates a JSON object before service calls. Invalid/missing/type-wrong bodies are client errors (400), not adapter failures. Result conflicts become 409; malformed upstream shapes become 502; upstream saturation/outage, OAuth absence, and signing-material absence become 503.

### Verification language
SQLite executes every numbered migration on a fresh in-memory schema and raw-reapplies them to prove idempotency where supplied. This is not migration-history/ledger enforcement.

## Migration Plan

1. Existing databases keep published `0001_initial.sql` unchanged.
2. Apply additive, raw-reapplication-safe `0002_product_aliases_canonical.sql` through the operator migration process.
3. Insert aliases in `product_aliases` and keep `config_json.aliases` valid/coherent; do not rely on `aliases_json` lookup.
4. Run tests, checks, OpenSpec validation, migration check, dry-run placeholder check, audits, package inspection, and scanner before release.
