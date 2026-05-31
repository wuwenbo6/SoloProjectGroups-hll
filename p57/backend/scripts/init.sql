CREATE TABLE IF NOT EXISTS kline_data (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    interval VARCHAR(10) NOT NULL DEFAULT '1m',
    open_time BIGINT NOT NULL,
    open DECIMAL(18, 8) NOT NULL,
    high DECIMAL(18, 8) NOT NULL,
    low DECIMAL(18, 8) NOT NULL,
    close DECIMAL(18, 8) NOT NULL,
    volume DECIMAL(18, 8) NOT NULL,
    close_time BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, interval, open_time)
);

CREATE INDEX IF NOT EXISTS idx_kline_symbol_time ON kline_data(symbol, interval, open_time DESC);

CREATE TABLE IF NOT EXISTS trade_data (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    price DECIMAL(18, 8) NOT NULL,
    quantity DECIMAL(18, 8) NOT NULL,
    trade_time BIGINT NOT NULL,
    is_buyer_maker BOOLEAN NOT NULL,
    trade_id VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trade_symbol_time ON trade_data(symbol, trade_time DESC);

CREATE TABLE IF NOT EXISTS orderbook_snapshot (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    bids JSONB NOT NULL,
    asks JSONB NOT NULL,
    last_update BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orderbook_symbol ON orderbook_snapshot(symbol, last_update DESC);

CREATE TABLE IF NOT EXISTS market_snapshot (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL UNIQUE,
    last_price DECIMAL(18, 8) NOT NULL,
    open_price DECIMAL(18, 8) NOT NULL,
    high_price DECIMAL(18, 8) NOT NULL,
    low_price DECIMAL(18, 8) NOT NULL,
    volume DECIMAL(18, 8) NOT NULL DEFAULT 0,
    quote_volume DECIMAL(18, 8) NOT NULL DEFAULT 0,
    price_change DECIMAL(18, 8) NOT NULL DEFAULT 0,
    change_percent DECIMAL(10, 4) NOT NULL DEFAULT 0,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_market_snapshot_symbol ON market_snapshot(symbol);

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_market_snapshot_timestamp ON market_snapshot;
CREATE TRIGGER update_market_snapshot_timestamp
    BEFORE UPDATE ON market_snapshot
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
