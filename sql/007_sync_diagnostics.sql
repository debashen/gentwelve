ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb;
-- A complete supplier response is staged before chunked processing. This makes
-- resume deterministic even when the live supplier feed changes between calls.
CREATE TABLE IF NOT EXISTS sync_source_records (
 run_id BIGINT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL,
 payload JSONB NOT NULL,
 PRIMARY KEY(run_id,ordinal)
);
