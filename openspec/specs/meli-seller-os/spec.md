# meli-seller-os Specification

## Purpose
Provide a safe, synthetic-only Mercado Libre seller operations Worker that supports receipt-bound Q&A, attribute maintenance, and moderation observation without creating listings or exposing production identities.

## Requirements

### Requirement: Configurable synthetic registry
The system SHALL resolve only validated synthetic product definitions from D1 `products` rows or documented `PRODUCT_REGISTRY_JSON`, including aliases. Definitions SHALL contain product key, aliases, seller, item, version, and attribute IDs/value names.

#### Scenario: D1 alias
- **WHEN** a valid D1 definition contains an alias
- **THEN** operations using that alias SHALL bind to that definition's seller and item.

#### Scenario: Invalid definition
- **WHEN** a D1 or environment definition is malformed
- **THEN** it SHALL not be used.

### Requirement: Q&A identity and concurrency
The system SHALL accept questions only when adapter-projected seller and item identities equal the configured definition. It SHALL deduplicate with an atomic D1 `INSERT ... ON CONFLICT DO NOTHING` keyed by product and question, and preserve only one concurrent observation.

#### Scenario: Concurrent poll
- **WHEN** two polls observe the same question concurrently
- **THEN** at most one durable row SHALL be created.

### Requirement: Answer receipts
Answer receipt IDs SHALL include cryptographic UUID entropy and SHALL NOT be timestamp-only. Receipts SHALL be HKDF-derived HMAC authenticated, approval-hash bound, short-lived, and require the exact approval literal. Apply SHALL re-read seller, item, unanswered state, text digest, and answer outcome; ambiguous write outcomes SHALL remain non-retriable outcome-unknown.

#### Scenario: Changed seller
- **WHEN** a question changes seller or item after preparation
- **THEN** apply SHALL reject it without an answer write.

### Requirement: Attribute patch receipts
Patch receipts SHALL be server-authenticated with HKDF/HMAC and bind product, seller, item, attribute target, and current state digest. Apply SHALL require the exact approval literal/hash, atomically claim monotonic progress, revalidate seller/item/state, PUT only the prepared attributes, and read back the item. Any malformed or hostile D1 row, conflict, or uncertain response SHALL fail closed as verification pending.

#### Scenario: Concurrent patch apply
- **WHEN** a patch is applied concurrently
- **THEN** at most one caller SHALL perform the PUT.

### Requirement: Moderation contracts
The adapter SHALL fail closed unless item ID and status are strings, `sub_status` is an array of strings, and `non_selling_reason` is null or a string. Snapshots and events SHALL be idempotent; events SHALL be unique by product key and digest.

#### Scenario: Unknown moderation shape
- **WHEN** the item adapter cannot project the bounded status shape
- **THEN** the poll SHALL fail closed without marketplace writes.

### Requirement: Marketplace transport
The production adapter SHALL use exact authenticated GET question/item/search, POST `/answers`, and PUT `/items/:id` contracts; non-success statuses and malformed read responses SHALL fail closed. It SHALL never call POST `/items`.

#### Scenario: Listing creation is attempted
- **WHEN** code would issue `POST /items`
- **THEN** the release scanner SHALL reject the repository surface.

### Requirement: Migration and publication verification
The migration ledger SHALL be tested against SQLite for fresh application, reapplication, and uniqueness constraints. The published package SHALL have MIT licensing, requested public metadata, intentional pack contents, and no high or critical audit findings. The repository scanner SHALL inspect worktree, staged blobs, and hidden environment files while excluding ignored dependency contents from the repository surface.

#### Scenario: Release verification
- **WHEN** the release gate is run
- **THEN** migration, package, dependency, and repository-surface verification SHALL fail closed on a violation.
