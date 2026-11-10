CREATE TABLE api_rate_limits (
    key_hash TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    request_count INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_rate_limits_updated ON api_rate_limits(updated_at);
