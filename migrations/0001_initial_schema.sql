-- Initial Schema Migration for Vigil Protocol
-- Tracks indexed EVM blocks, borrower positions, oracle prices, and liquidation events.

CREATE TABLE IF NOT EXISTS blocks (
    block_number BIGINT PRIMARY KEY,
    block_hash VARCHAR(66) NOT NULL,
    parent_hash VARCHAR(66) NOT NULL,
    timestamp BIGINT NOT NULL,
    is_reorged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS positions (
    account VARCHAR(42) NOT NULL,
    collateral_asset VARCHAR(42) NOT NULL,
    collateral_amount NUMERIC(78, 0) NOT NULL DEFAULT 0,
    debt_amount NUMERIC(78, 0) NOT NULL DEFAULT 0,
    health_factor NUMERIC(78, 0) NOT NULL DEFAULT 0,
    last_updated_block BIGINT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (account, collateral_asset)
);

CREATE INDEX IF NOT EXISTS idx_positions_health_factor ON positions(health_factor);
CREATE INDEX IF NOT EXISTS idx_positions_account ON positions(account);

CREATE TABLE IF NOT EXISTS oracle_prices (
    asset VARCHAR(42) NOT NULL,
    price_wad NUMERIC(78, 0) NOT NULL,
    block_number BIGINT NOT NULL,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (asset, block_number)
);

CREATE TABLE IF NOT EXISTS liquidations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id VARCHAR(64) NOT NULL,
    borrower VARCHAR(42) NOT NULL,
    collateral_asset VARCHAR(42) NOT NULL,
    debt_covered NUMERIC(78, 0) NOT NULL,
    collateral_seized NUMERIC(78, 0) NOT NULL,
    liquidator VARCHAR(42) NOT NULL,
    tx_hash VARCHAR(66),
    block_number BIGINT,
    status VARCHAR(32) NOT NULL, -- 'SUBMITTED', 'CONFIRMED', 'REVERTED', 'REORGED'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_liquidations_borrower ON liquidations(borrower);
CREATE INDEX IF NOT EXISTS idx_liquidations_trace_id ON liquidations(trace_id);
