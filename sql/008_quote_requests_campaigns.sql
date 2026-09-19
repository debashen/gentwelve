ALTER TABLE sales_enquiries ADD COLUMN IF NOT EXISTS request_key UUID UNIQUE;
ALTER TABLE sales_enquiries ADD COLUMN IF NOT EXISTS reference TEXT UNIQUE;
CREATE SEQUENCE IF NOT EXISTS sales_enquiry_reference_seq;
CREATE TABLE IF NOT EXISTS sales_artwork (
 id UUID PRIMARY KEY,
 enquiry_id UUID NOT NULL REFERENCES sales_enquiries(id),
 filename TEXT NOT NULL,
 content_type TEXT NOT NULL,
 bytes BYTEA NOT NULL CHECK(octet_length(bytes)<=3000000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public_rate_limits (
 key TEXT PRIMARY KEY,
 bucket TIMESTAMPTZ NOT NULL,
 hits INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS marketing_campaigns (
 id UUID PRIMARY KEY,
 data JSONB NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS marketing_assets (
 id UUID PRIMARY KEY,
 content_type TEXT NOT NULL,
 bytes BYTEA NOT NULL CHECK(octet_length(bytes)<=1000000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS marketing_events (
 id BIGSERIAL PRIMARY KEY,
 campaign_id UUID NOT NULL REFERENCES marketing_campaigns(id),
 visitor UUID NOT NULL,
 event TEXT NOT NULL CHECK(event IN ('impression','click','dismiss','product_view')),
 product_code TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_event_summary ON marketing_events(campaign_id,event,created_at);
CREATE INDEX IF NOT EXISTS marketing_event_dedupe ON marketing_events(campaign_id,visitor,event,created_at);
