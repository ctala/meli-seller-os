# Security

- Keep `.env.*` and `.dev.vars.*` private; `.env.example` is the only exception.
- Receipts expose only the approval hash; HMAC material is derived server-side via HKDF and is never returned.
- D1 rows are treated as hostile input: receipt MAC/binding and registry target/state are rechecked before writes.
- Internal routes require `Authorization: Bearer` and fail closed when the configured token is absent.
- Production adapter write surface is restricted to POST `/answers` and PUT `/items/:id`. There is no POST `/items` path.
- Examples use `example.test`, seller `10000001`, and item `TST100000001` only.

OAuth refresh, token storage, and listing creation are roadmap items, not security claims of v0.1.