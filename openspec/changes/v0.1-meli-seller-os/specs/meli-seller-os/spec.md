# meli-seller-os change delta

## ADDED Requirements

### Requirement: Reader-testing hardening
The system SHALL permit authorized real seller/item IDs only in private D1 or `PRODUCT_REGISTRY_JSON` configuration while repository/public artifacts remain synthetic-only. It SHALL use `product_aliases` as the sole exact D1 alias source, retain valid `config_json.aliases`, bind patches to the documented allowlisted item-state projection, validate every POST body before service calls, and publish coherent 400/404/409/502/503 mappings.

#### Scenario: Invalid request body
- **WHEN** a prepare/apply request has invalid JSON, `null`, an array, missing fields, or non-string fields
- **THEN** the router SHALL return `400 {"error":"invalid_request"}` without calling the service.

#### Scenario: Deprecated aliases JSON
- **WHEN** `products.aliases_json` disagrees with `product_aliases`
- **THEN** runtime lookup SHALL use only the exact `product_aliases` mapping.

#### Scenario: Projection-only digest
- **WHEN** an item price/title/condition changes but `id`, `seller_id`, `status`, and `attributes` do not
- **THEN** the patch projection digest SHALL not claim to detect that change.
