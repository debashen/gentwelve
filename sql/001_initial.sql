CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  supplier_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  product_type TEXT NOT NULL DEFAULT 'product',
  category TEXT,
  brand TEXT,
  image_url TEXT,
  supplier_price_cents INTEGER,
  public_price_cents INTEGER,
  minimum_quantity INTEGER,
  branding_methods_json TEXT NOT NULL DEFAULT '[]',
  raw_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  curated INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  trending INTEGER NOT NULL DEFAULT 0,
  new_arrival INTEGER NOT NULL DEFAULT 0,
  display_priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_active_curated ON products(active, curated);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_merchandising ON products(curated, featured, trending, new_arrival, display_priority);

CREATE TABLE IF NOT EXISTS variants (
  id BIGSERIAL PRIMARY KEY,
  product_code TEXT NOT NULL,
  full_code TEXT NOT NULL UNIQUE,
  colour TEXT,
  size TEXT,
  stock_quantity INTEGER,
  supplier_price_cents INTEGER,
  public_price_cents INTEGER,
  image_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_variants_product_code ON variants(product_code);

CREATE TABLE IF NOT EXISTS sync_runs (
  id BIGSERIAL PRIMARY KEY,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  products_received INTEGER NOT NULL DEFAULT 0,
  products_stored INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS catalogue_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  product_code TEXT,
  quantity TEXT,
  search_query TEXT,
  filter_name TEXT,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_catalogue_events_created_type ON catalogue_events(created_at, event_type);
CREATE INDEX IF NOT EXISTS idx_catalogue_events_product_created ON catalogue_events(product_code, created_at);
