# Vigil Scenario Testing Suite

This folder contains the automated acceptance scenario and chaos test harnesses for the **Vigil** Web3 lending and liquidation protocol.

## Acceptance Scenario Flow
1. **Bootstrap**: Deploys protocol and lists three collateral assets (one fee-on-transfer, one 6-decimal, one 8-decimal) plus the debt stablecoin.
2. **Seeding**: Opens 100 borrower positions with health factors randomly distributed between 1.05 and 1.6.
3. **Crash & Injections**:
   - Drops collateral prices 25% over 15 blocks.
   - **Block 8**: Injects a 2-block EVM reorg (`evm_snapshot` / `evm_revert`).
   - **Block 10**: Runs TWAP-manipulation attack simulations.
   - **Block 12**: Simulates crash failure by killing the Liquidator container and restarting it 3 blocks later.
4. **Validation**: Advances chain 30 blocks post-crash and measures pass criteria.

## Hard-Zero Criteria
- **Duplicate liquidations**: `0`
- **Nonce gaps after run**: `0`
- **Successful manipulation attacks**: `0`
- **Rust / Solidity health-factor divergences**: `0`
- **Indexer gaps or duplicates after reorg**: `0`
- **Positions still liquidatable at end**: `0`
