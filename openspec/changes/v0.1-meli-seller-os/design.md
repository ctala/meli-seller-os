## Context

See `proposal.md` for motivation. The Worker already separates marketplace transport, receipt-bound service logic, and D1 persistence. It must operate only on synthetic registry data, reject malformed marketplace responses, and preserve an auditable public package surface.

## Goals / Non-Goals

**Goals:**
- Resolve product aliases only to validated synthetic registry definitions.
- Make Q&A, attribute updates, and moderation observations safe under concurrent execution through durable D1 claims.
- Keep marketplace access constrained to exact read, answer, and prepared attribute-patch contracts.
- Verify migrations, package metadata, and the repository release surface before publication.

**Non-Goals:**
- Creating listings, automatic OAuth refresh, scheduler jobs, or marketplace moderation writes.
- Supporting real seller/item identities or production credentials.
- Retrying ambiguous marketplace write outcomes automatically.

## Decisions

### Registry is an allowlist, not discovery
Validated D1 rows and the documented environment registry are the only product sources. Each operation resolves an exact alias before calling the adapter, then compares projected seller and item identifiers with that definition. This is chosen over marketplace-side discovery because it prevents an arbitrary input from selecting a seller or item.

### Receipts bind intent and current state
Preparation creates short-lived HKDF/HMAC-authenticated receipts that include cryptographic UUID entropy, the exact approval literal/hash, target identity, and state digest. Apply re-reads the marketplace state and claims progress atomically before writing. This is chosen over timestamp receipts or client-held approval state because concurrent callers and changed remote state must fail closed.

### D1 uniqueness is the concurrency boundary
Question observations, patch progress, moderation snapshots, and moderation events use `INSERT ... ON CONFLICT DO NOTHING` or equivalent unique constraints as the single durable winner. This is chosen over in-memory locks because Worker instances are independent and may run concurrently.

### Bounded transport projections fail closed
The adapter makes only documented GETs, `POST /answers`, and prepared `PUT /items/:id` calls, then validates fields before service use. It never calls `POST /items`. This is chosen over permissive response parsing so an API shape change cannot cause a write based on untrusted data.

### Release verification is local and deterministic
Migration checks use SQLite. The release gate scans the worktree and staged surface, Git object reachability, and the `npm pack --dry-run` manifest and contents. This is chosen over relying on ignore rules or package metadata alone because staged-only files, dangling objects, and packaged-but-skipped test paths otherwise escape review.

## Risks / Trade-offs

- [Marketplace API response drift can interrupt operations] → Validate bounded projections and reject malformed responses before any write.
- [A remote write can succeed after a transport failure] → Preserve `outcome-unknown` and require human reconciliation instead of retrying.
- [Concurrent Workers can race] → Use D1 atomic uniqueness claims and verify one durable winner in tests.
- [Release checks can reject stale local Git objects or accidental package contents] → Make the gate fail closed; initialize a clean repository and inspect the generated manifest before release.
- [Synthetic fixtures can resemble sensitive data] → Use reserved identifiers/domains and synthetic marker values only; do not add credentials or real blobs.

## Migration Plan

1. Apply `0001_initial.sql` to a fresh D1 database and run the idempotency/uniqueness verification.
2. Configure only synthetic registry data and deploy with a non-placeholder D1 binding after predeploy validation.
3. Run tests, TypeScript checks, scanner, OpenSpec validation, package inspection, and dependency audit before publication.
4. If a deployment must be rolled back, stop routing to the Worker version; do not replay ambiguous writes. Schema additions are additive and D1 receipts/events remain available for reconciliation.

## Open Questions

None.
