-- Fresh databases only: the included migration ledger applies each numbered file once.
-- Do not execute this raw file twice against an existing database.
CREATE TABLE IF NOT EXISTS products (product_key TEXT PRIMARY KEY, seller_id TEXT NOT NULL, item_id TEXT NOT NULL, aliases_json TEXT NOT NULL DEFAULT '[]', config_json TEXT NOT NULL, UNIQUE(seller_id,item_id));
CREATE TABLE IF NOT EXISTS product_aliases (alias TEXT PRIMARY KEY CHECK(length(alias)>0), product_key TEXT NOT NULL REFERENCES products(product_key) ON DELETE CASCADE, UNIQUE(product_key,alias));
CREATE TABLE IF NOT EXISTS qa_seen (product_key TEXT NOT NULL, question_id TEXT NOT NULL, text_hash TEXT NOT NULL, classification TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(product_key,question_id));
CREATE TABLE IF NOT EXISTS qa_receipts (receipt_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, mac TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS qa_progress (receipt_id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('prepared','claimed','answered','outcome_unknown')), updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS patch_receipts (receipt_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, mac TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS patch_progress (receipt_id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('prepared','in_progress','completed','verification_pending')), updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS moderation_snapshots (product_key TEXT NOT NULL, digest TEXT NOT NULL, snapshot_json TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(product_key,digest));
CREATE TABLE IF NOT EXISTS moderation_events (id INTEGER PRIMARY KEY, product_key TEXT NOT NULL, prior_digest TEXT, digest TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(product_key,digest));
