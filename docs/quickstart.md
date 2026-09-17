# Quickstart

1. Copy `.env.example` locally; never commit it. Values shown are synthetic.
2. Apply `migrations/0001_initial.sql` to a fresh D1 database.
3. Configure `INTERNAL_AUTH_TOKEN`, a base64url 32-byte `RECEIPT_ROOT_KEY`, and optionally `MELI_ACCESS_TOKEN`.
4. Deploy only after `npm test`, `npm run check`, `npm run openspec:validate`, and `npm run dry-run` pass.

Call `GET https://example.test/internal/products/demo_widget/moderation/poll` with `Authorization: Bearer <internal-token>`. The monitor performs only an item GET through the production adapter. No create-listing route exists.