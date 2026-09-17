# Changelog

## 0.1.1 — 2026-09-17

### Changed
- Clarified the public-source policy: repository fixtures/examples remain synthetic-only; private D1 and `PRODUCT_REGISTRY_JSON` runtime configuration may contain authorized real seller/item IDs.
- Made `product_aliases` the documented sole D1 exact-alias lookup source; `products.aliases_json` is deprecated and ignored by runtime lookup.
- Documented the attribute receipt's allowlisted item-state projection digest (`id`, `seller_id`, `status`, `attributes`) rather than claiming a full item-state digest.
- Hardened internal request validation and documented HTTP error mapping.
- Expanded scanner coverage to literal `.env` and `.dev.vars` names.
- Renamed migration verification claims to a fresh-schema/raw-reapplication check.

## 0.1.0 — public release

Initial public release.
