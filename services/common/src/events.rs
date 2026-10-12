//! NATS JetStream messaging events and schema definitions.

use serde::{Deserialize, Serialize};
use crate::types::{Address, OraclePrice};

pub const SUBJECT_CHAIN_EVENTS: &str = "vigil.events.chain";
pub const SUBJECT_LIQUIDATION_SIGNALS: &str = "vigil.signals.liquidation";
pub const SUBJECT_REORG_NOTICES: &str = "vigil.notices.reorg";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceContext {
    pub trace_id: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ChainEvent {
    Deposit {
        account: Address,
        asset: Address,
        amount: u128,
        block_number: u64,
        tx_hash: String,
    },
    Borrow {
        account: Address,
        amount: u128,
        block_number: u64,
        tx_hash: String,
    },
    Repay {
        account: Address,
        amount: u128,
        block_number: u64,
        tx_hash: String,
    },
    LiquidationCall {
        collateral_asset: Address,
        user: Address,
        debt_to_cover: u128,
        liquidated_collateral_amount: u128,
        liquidator: Address,
        block_number: u64,
        tx_hash: String,
    },
    PriceUpdated(OraclePrice),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiquidationSignal {
    pub trace_id: String,
    pub borrower: Address,
    pub collateral_asset: Address,
    pub health_factor_wad: u128,
    pub total_debt_wad: u128,
    pub total_collateral_value_wad: u128,
    pub detected_at_block: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReorgNotice {
    pub reorg_depth: u64,
    pub from_block: u64,
    pub to_block: u64,
    pub new_head_hash: String,
}
