# meli-seller-os

Synthetic, receipt-bound Worker for controlled seller operations. It does not create or publish listings.

## Configuration

Production registry definitions are loaded in this order: a validated `products` D1 row joined to the normalized `product_aliases` table by exact equality, then `PRODUCT_REGISTRY_JSON`; the built-in two-product synthetic registry is only a deterministic development fallback. Alias lookups never use SQL `LIKE` or wildcard semantics. A definition requires `product_key`, `aliases`, `seller_id`, `item_id`, `version`, and `attributes` with `{id,value_name}`. Use only synthetic identifiers in repository configuration.

Copy `wrangler.example.toml` to `wrangler.toml` and replace its D1 UUID before deployment. `npm run predeploy` rejects the documented placeholder. The intentional public namespace `ctala/meli-seller-os` is retained in package repository, homepage, and bugs metadata; author metadata is only `ctala`.

`RECEIPT_ROOT_KEY` is a 32-byte base64url value supplied only as a Worker secret. Receipts use HKDF-SHA-256 derived HMACs; no signing key, MAC, or approval secret is returned by API responses.

## Safety contracts

- Question records must carry the configured item and seller identity. Polling uses atomic `INSERT ... ON CONFLICT DO NOTHING`; applying re-reads seller, item, unanswered state, text digest, and answer outcome.
- Answers require the exact literal `OK responder pregunta <question_id> con hash <approval_hash>`.
- Attribute patches require the exact literal `OK aplicar atributos <item_id> con hash <approval_hash>`. The receipt is HMAC-bound to seller, item, target attributes, and pre-write state digest. Apply claims progress atomically, makes one PUT at most, and returns `verification_pending` for ambiguous outcomes.
- Moderation accepts only string `status`, string-array `sub_status`, and null-or-string `non_selling_reason`; unknown provider shapes fail closed. Events are unique by `(product_key,digest)`.
- The marketplace adapter makes only GET question/item/search, POST `/answers`, and PUT `/items/:id`; there is no POST `/items` path.

## Checks

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

The migration ledger test applies the fresh migration twice against real SQLite and verifies uniqueness constraints. The public scanner checks the worktree and staged blobs, including hidden env files; it intentionally excludes ignored `node_modules` from the repository surface. Package contents remain explicitly reviewed via `npm pack --dry-run`.
