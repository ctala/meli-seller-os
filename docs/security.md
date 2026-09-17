# Security

- Repository source, fixtures, examples, and public docs are synthetic-only. Private D1 and `PRODUCT_REGISTRY_JSON` runtime configuration may contain operator-authorized real seller/item IDs; never commit them.
- Keep `.env`, `.env.*`, `.dev.vars`, and `.dev.vars.*` private; `.env.example` is the only tracked template exception.
- `product_aliases` is the only D1 alias lookup source. `products.aliases_json` is deprecated compatibility storage and ignored by runtime lookup; `config_json.aliases` must still validate.
- Receipts expose only approval hashes; HMAC material is derived server-side via HKDF and is never returned.
- Attribute receipts bind an allowlisted item-state projection digest over only `id`, `seller_id`, `status`, and `attributes`, not price, title, condition, or full item state.
- D1 rows are hostile input: receipt MAC/binding and registry target/projection are rechecked before writes.
- Internal routes require `Authorization: Bearer <token>` and fail closed when the configured token is absent.
- Production adapter write surface is restricted to POST `/answers` and PUT `/items/:id`. There is no POST `/items` path.
- Constant-time comparison is timing-equal only for equal-length strings.

OAuth refresh, token storage, listing creation, rate limiting, retention cleanup, metrics, and audit-log export are not implemented in v0.1.1.
