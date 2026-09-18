CREATE TABLE sales_business_settings (
  id TEXT PRIMARY KEY CHECK(id='default'),
  data JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO sales_business_settings(id) VALUES ('default');
CREATE TABLE sales_customers (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sales_customers_name ON sales_customers(lower(name));
CREATE TABLE sales_number_sequences (
  kind TEXT PRIMARY KEY CHECK(kind IN ('quote','order','invoice','delivery')),
  prefix TEXT NOT NULL UNIQUE,
  next_number BIGINT NOT NULL CHECK(next_number>0)
);
INSERT INTO sales_number_sequences VALUES ('quote','QT-',1),('order','SO-',1),('invoice','INV-',1),('delivery','DN-',1);
CREATE TABLE sales_audit (
  id BIGSERIAL PRIMARY KEY,
  entity_id TEXT NOT NULL,
  event TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sales_audit_entity ON sales_audit(entity_id,created_at);
CREATE TABLE sales_enquiries (
  id UUID PRIMARY KEY,
  customer_id UUID REFERENCES sales_customers(id),
  contact_name TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  details JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','quoted','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sales_enquiries_status ON sales_enquiries(status,created_at DESC);
