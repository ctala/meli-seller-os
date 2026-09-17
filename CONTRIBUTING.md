# Contributing

Use only synthetic fixtures and example.test. Do not add secrets, personal data, production IDs, real seller names, or marketplace receipts. Keep all marketplace writes inside `HttpMarketplaceAdapter`; no listing creation route is accepted.

Run `npm test`, `npm run check`, `npm run openspec:validate`, `npm run dry-run`, and `npm audit --omit=dev` before proposing a release.