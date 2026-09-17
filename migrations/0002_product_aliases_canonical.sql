-- `product_aliases` is the only exact-alias lookup source.
-- `products.aliases_json` remains only for backwards-compatible row storage and is ignored by runtime lookup.
-- A migration history table is not implemented; this file is intentionally raw-reapplication safe.
CREATE INDEX IF NOT EXISTS product_aliases_product_key_idx ON product_aliases(product_key);
-- Prevent an alias from shadowing any product_key (and vice versa).
CREATE TRIGGER IF NOT EXISTS product_aliases_no_product_key_collision_insert
BEFORE INSERT ON product_aliases
WHEN EXISTS (SELECT 1 FROM products WHERE product_key = NEW.alias)
BEGIN SELECT RAISE(ABORT, 'product alias collides with product_key'); END;
CREATE TRIGGER IF NOT EXISTS product_aliases_no_product_key_collision_update
BEFORE UPDATE OF alias ON product_aliases
WHEN EXISTS (SELECT 1 FROM products WHERE product_key = NEW.alias)
BEGIN SELECT RAISE(ABORT, 'product alias collides with product_key'); END;
CREATE TRIGGER IF NOT EXISTS products_no_alias_collision_insert
BEFORE INSERT ON products
WHEN EXISTS (SELECT 1 FROM product_aliases WHERE alias = NEW.product_key)
BEGIN SELECT RAISE(ABORT, 'product_key collides with product alias'); END;
CREATE TRIGGER IF NOT EXISTS products_no_alias_collision_update
BEFORE UPDATE OF product_key ON products
WHEN EXISTS (SELECT 1 FROM product_aliases WHERE alias = NEW.product_key)
BEGIN SELECT RAISE(ABORT, 'product_key collides with product alias'); END;
