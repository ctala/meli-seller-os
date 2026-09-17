# v0.1 release checklist

- [ ] Fresh migration `0001_initial.sql` succeeds and upgrade is idempotent.
- [ ] `npm ci`, tests, check, strict OpenSpec validation, dry-run, and audit pass.
- [ ] Public scan finds no secrets, PII, real identifiers/domains, receipts, hidden-file leaks, Git-index leaks, alternate answer/item writes, or POST item creation.
- [ ] Stage every file; leave no unstaged or untracked files.

v0.1 does not release listing creation, marketplace moderation writes, scheduler jobs, or automatic OAuth refresh.