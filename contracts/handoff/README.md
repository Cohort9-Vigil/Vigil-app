# Vigil contracts: frontend handoff

ABIs in `abi/` were exported from commit `04624ee` (branch `feat/contracts-core`). Regenerate them whenever a contract's public functions, events or errors change:

```
forge build
forge inspect VigilPool abi --json > handoff/abi/VigilPool.json
```

## Status

- Addresses are in `../deployments/anvil.json`, written by `script/Deploy.s.sol`. To get a local system with 100 seeded positions, start `anvil` and run `script/local.sh`. On a fresh anvil the addresses come out the same every time.
- Chain is anvil, chain id 31337.
- The contracts are covered by unit, fuzz, invariant and attack tests, but nothing has been run against a UI yet.

## Files

| File | Use it at |
|---|---|
| `abi/VigilPool.json` | the pool **proxy** address, never the implementation |
| `abi/LiquidationSettlement.json` | the settlement address |
| `abi/OracleAdapter.json` | the oracle address (read only from the UI) |
| `abi/IERC20.json` | each token, for `approve`, `balanceOf` and `allowance` |

The ABIs include the custom errors, so viem and ethers can decode reverts into names like `HealthFactorTooLow`.

## Units

| Value | Scale |
|---|---|
| Health factor | 1e18, so `1e18` is exactly 1. A position with no debt returns `type(uint256).max` |
| Prices | 1e18 per whole token |
| Interest indexes | 1e27 |
| Bonus and thresholds | basis points, 10,000 = 100% |
| Token amounts | the token's own decimals (6, 8 or 18) |

## Pool: user actions

All of these take effect on the caller's own position.

| Function | Notes |
|---|---|
| `supply(amount)` | lend the stablecoin to earn interest, needs `approve` first |
| `withdrawSupply(amount)` | |
| `depositCollateral(asset, amount)` | needs `approve` first. Also enables the asset for the health factor |
| `withdrawCollateral(asset, amount)` | reverts with `HealthFactorTooLow` if it would leave the position unsafe |
| `setCollateralEnabled(asset, enabled)` | disabling is checked the same way |
| `borrow(amount)` | stablecoin only, so no asset argument |
| `repay(amount)` | needs `approve` first. An amount above the debt is capped to the debt |

When the oracle is Frozen only `repay` and `depositCollateral` work. Everything else reverts with `OracleFrozen`. When the pool is paused, `repay` and `depositCollateral` still work too.

## Pool: reads

| Function | Returns |
|---|---|
| `getHealthFactor(user)` | health factor |
| `getDebt(user)` | debt including interest accrued up to now |
| `getCollateralBalance(user, asset)` | amount of that collateral |
| `getLiquidationData(user, asset)` | `(healthFactor, debt, collateralBalance)` in one call |
| `positionOf(user)` | `(scaledDebt, scaledSupply, bitmap)`. These are scaled, not real amounts |
| `poolState()` | `(borrowIndex, liquidityIndex, totalScaledDebt, totalScaledSupply, reserve, deficit, paused)` |
| `assetConfig(asset)` | `(listed, id, decimals, liquidationThresholdBps)` |
| `getPrice(asset)` | price from the oracle |
| `debtAsset()` | the stablecoin address |
| `hasCollateral(user)` | true if the user holds any collateral |

Things to know about the reads:

- **Supply balance has no getter.** Compute it as `scaledSupply * liquidityIndex / 1e27`, using `positionOf` and `poolState`.
- `getHealthFactor`, `getDebt`, `getLiquidationData` and `getPrice` revert while the pool is in the middle of a call. A normal `eth_call` never hits this.
- `getHealthFactor` and `getPrice` also revert when a price feed is invalid or stale. Show "price unavailable" rather than an error.
- There is no on-chain list of positions or collateral assets. Get the asset list from the deployment file or the `CollateralListed` event. For dashboards that list many positions, use the Risk Engine snapshot API.

## Oracle

- `state()` returns 0 for Normal and 1 for Frozen. Use it to show a banner and disable buttons.
- `getPrice(asset)` reverts with `InvalidPrice(asset)` when that asset's feed is bad.

## Liquidation

1. Anyone calls `startAuction(borrower)` once the health factor is below 1e18.
2. `currentBonusBps(borrower)` gives the live bonus. It grows linearly from 0 to `maxBonusBps()` over `auctionDuration()` blocks, counted from `auctionStartBlock(borrower)`.
3. The liquidator signs an intent. Anyone can then submit it with `executeLiquidation(intent, signature)`. The signer pays the repayment, so the signer must have approved the settlement contract for the stablecoin.
4. At most 50% of the debt can be repaid per liquidation, unless the remainder would be below `dustThreshold()`, or the position is underwater (its collateral is worth less than the debt plus the bonus). An underwater position can be cleared in one go, and whatever debt is left once the collateral is gone is written off against the reserve.

`resetAuction(borrower)` clears an auction after the position is healthy again. `settleBadDebt(borrower)` writes off debt once the collateral is gone.

### Signing the intent (EIP-712)

Domain:

```
name: "VigilLiquidation"
version: "1"
chainId: <chain id>
verifyingContract: <settlement address>
```

Type:

```
LiquidationIntent(
  address borrower,
  address collateralAsset,
  uint256 maxRepay,
  uint256 minCollateralOut,
  uint256 nonce,
  uint256 deadline
)
```

- `deadline` is a unix timestamp in seconds.
- `maxRepay` is in stablecoin units.
- `nonce` can be any number that has not been used by that signer. Check with `nonceBitmap(signer, nonce >> 8)`: if bit `nonce & 255` is set, the nonce is taken.

## Events

Pool: `Supplied`, `SupplyWithdrawn`, `CollateralDeposited`, `CollateralWithdrawn`, `CollateralEnabledChanged`, `Borrowed`, `Repaid`, `Liquidated`, `BadDebtWrittenOff`, `InterestAccrued`, `CollateralListed`, `SettlementSet`, `Paused`, `Unpaused`.

Settlement: `AuctionStarted`, `AuctionReset`, `LiquidationExecuted`, `NonceUsed`, `BadDebtSettled`.

## Errors worth showing to users

| Error | Meaning |
|---|---|
| `OracleFrozen` | prices are not trustworthy, only repay and add collateral work |
| `PoolPaused` | the pool is paused |
| `HealthFactorTooLow` | the action would leave the position unsafe |
| `InsufficientLiquidity` | not enough stablecoin in the pool to borrow or withdraw |
| `InsufficientBalance` | the user does not hold that much |
| `ZeroAmount` | amount was 0 |
| `PositionHealthy` | liquidation attempted on a healthy position |
| `IntentExpired`, `NonceAlreadyUsed`, `InvalidSignature` | a bad liquidation intent |
| `InsufficientCollateralOut` | collateral received would be below `minCollateralOut` |

## Not for the UI

`applyLiquidation`, `writeOffBadDebt`, `listCollateral`, `setSettlement`, `pause`, `unpause`, `setSource` and the upgrade functions are admin or internal.
