# meli-seller-os Specification

## Purpose
Provide a safe Mercado Libre seller-operations Worker with receipt-bound Q&A, configured attribute maintenance, and read-only moderation observation. Public repository material is synthetic-only; private runtime configuration may bind authorized real seller/item identities.

## Requirements

### Requirement: Private runtime registry and public-source policy
The system SHALL resolve validated product definitions from D1 or `PRODUCT_REGISTRY_JSON`, including authorized real seller/item IDs in private runtime configuration. Repository source, fixtures, examples, and public documentation SHALL use synthetic identifiers only. Definitions SHALL contain product key, aliases, seller, item, version, and attribute IDs/value names.

#### Scenario: Real private configuration
- **WHEN** an operator configures an authorized real seller/item pair in D1 or `PRODUCT_REGISTRY_JSON`
- **THEN** the Worker MAY bind operations to that configured pair without requiring it to appear in repository source.

### Requirement: Canonical exact D1 aliases
`product_aliases` SHALL be the sole D1 alias lookup source with exact equality. `products.aliases_json` SHALL be deprecated compatibility storage and ignored by lookup. `config_json.aliases` SHALL remain required for product-definition validation.

#### Scenario: Alias lookup
- **WHEN** a valid alias row exists for a product and `config_json` contains valid aliases
- **THEN** operations using the exact alias SHALL bind to that product's seller and item.

### Requirement: Q&A identity and concurrency
The system SHALL accept questions only when adapter-projected seller and item identities equal the configured definition. It SHALL deduplicate with an atomic D1 `INSERT ... ON CONFLICT DO NOTHING` keyed by product and question.

#### Scenario: Concurrent poll
- **WHEN** two polls observe one question concurrently
- **THEN** at most one durable row SHALL be created.

### Requirement: Answer receipts
Answer receipt IDs SHALL include cryptographic UUID entropy and SHALL be HKDF-derived HMAC authenticated, approval-hash bound, short-lived, and require the exact approval literal. `text` in prepare/apply SHALL mean the exact proposed answer; the service SHALL reread the question internally. Apply SHALL re-read seller, item, unanswered state, question-text digest, and outcome; ambiguous outcomes SHALL remain non-retriable `outcome_unknown`.

#### Scenario: Changed question
- **WHEN** the question text changes after prepare
- **THEN** apply SHALL reject without an answer write.

### Requirement: Attribute patch receipts
Patch receipts SHALL bind product, seller, item, attribute target, and an **allowlisted item-state projection digest** containing only `id`, `seller_id`, `status`, and `attributes`. They SHALL NOT claim a full-state, price, title, or condition digest. Apply SHALL validate the exact approval, atomically claim progress, revalidate the same projection, PUT only prepared attributes, and read back the item.

#### Scenario: Price-only change
- **WHEN** only price changes after prepare
- **THEN** the projection digest SHALL not claim state drift.

### Requirement: Router validation and errors
Before calling any prepare/apply service method, the router SHALL reject invalid JSON, `null`, arrays, missing fields, and non-string required fields with `400 {"error":"invalid_request"}`. It SHALL map unknown products to 404, valid request/state or receipt conflicts to 409, malformed upstream projections to 502, and unavailable upstream/OAuth/signing dependencies to 503 without changing success responses.

#### Scenario: Invalid JSON object
- **WHEN** a POST body is invalid JSON, null, an array, missing a field, or type-wrong
- **THEN** the router SHALL return 400 invalid_request before service invocation.

### Requirement: Moderation contracts
The adapter SHALL fail closed unless item ID and status are strings, `sub_status` is an array of strings, and `non_selling_reason` is null or a string. Snapshots/events SHALL be idempotent. The classifier SHALL emit only its documented taxonomy and SHALL NOT include unimplemented `spam_repetition`.

#### Scenario: Unknown moderation shape
- **WHEN** the provider projection is malformed
- **THEN** moderation polling SHALL fail closed.

### Requirement: Publication verification
Migration verification SHALL be described as a SQLite fresh-schema/raw-reapplication check, not a migration ledger. The scanner SHALL inspect literal and suffixed `.env` and `.dev.vars` names as well as worktree, staged blobs, Git objects, and package surface.

#### Scenario: Literal local environment file
- **WHEN** repository surface contains `.env` or `.dev.vars`
- **THEN** the scanner SHALL reject it.
