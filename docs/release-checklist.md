# v0.1.1 release checklist

- [ ] Fresh schema and raw migration reapplication check succeeds (`npm run migrations:verify`).
- [ ] `npm ci`, tests, check, strict OpenSpec validation, expected-placeholder dry-run, and audits pass.
- [ ] Public scan finds no secrets, PII, real identifiers/domains, receipts, literal/suffixed hidden environment files, Git-index leaks, alternate answer/item writes, or POST item creation.
- [ ] Inspect `npm pack --dry-run`; package metadata is `0.1.1` and CHANGELOG is reviewed.
- [ ] Stage every intended file; leave no unstaged or untracked files.

v0.1.1 does not release listing creation, marketplace moderation writes, scheduler jobs, automatic OAuth refresh, app rate limits, retention cleanup, or observability export.
