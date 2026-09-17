-- Track supplier presence separately from admin edits to updated_at.
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_product_run BIGINT;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS last_stock_run BIGINT;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS last_price_run BIGINT;
