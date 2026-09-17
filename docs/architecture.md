# Architecture

The registry resolves an opaque product key or alias to a synthetic seller and item. At runtime it accepts validated D1 `products` definitions first, then `PRODUCT_REGISTRY_JSON`; the two bundled definitions are deterministic development fallbacks. Worker routes require constant-time internal bearer authentication. Services re-derive seller, item, attributes, and state from the active registry after reading receipts, so D1 is hostile input rather than authority.

Q&A projects adapter `seller_id` and rejects any seller/item mismatch. Polling uses `INSERT ... ON CONFLICT DO NOTHING` for durable question dedupe. Prepare creates a UUID-bearing, approval-hash-bound HKDF/HMAC receipt. Apply requires the literal approval, revalidates the current seller/item/unanswered/text state, claims once in D1, sends one answer POST, and reads the question back; ambiguous transport or readback becomes `outcome_unknown`.

Attribute patches bind the seller, item, exact registry target, an allowlisted preflight item-state projection digest, approval hash, and server-only HMAC. The projection is exactly `{id, seller_id, status, attributes}`: it deliberately excludes price, title, condition, and every other item field. Apply requires `OK aplicar atributos <item_id> con hash <approval_hash>`, verifies the hostile receipt, claims monotonic progress atomically, PUTs only prepared attributes, and completes only after seller/item/attribute readback. Any conflict or uncertain result is `verification_pending`.

Moderation is read-only. The adapter projects only item ID/status strings, string-array `sub_status`, and null-or-string `non_selling_reason`; all other provider shapes fail closed. Snapshot and event storage is idempotent, and events are unique by `(product_key,digest)`.
