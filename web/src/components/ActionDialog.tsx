// Modern DeFi Action Modal: Supply, Borrow, Repay, Withdraw with real-time risk gauges
import { useEffect, useState, useMemo } from "react";
import { ethers } from "ethers";
import { fmt, dollars } from "../lib/format.ts";
import {
  borrowCapacity,
  healthAfterBorrow,
  afterSupply,
  maxWithdrawable,
  healthFactor,
  limitUsedPercent,
  ONE,
  type Position,
} from "../lib/position.ts";
import { tokenInfo } from "../lib/tokens.ts";
import type { Collateral, Config } from "../lib/types.ts";
import type { MarketRates } from "../lib/rates.ts";
import type { Tab } from "./Markets.tsx";
import type { ActionMessage } from "../pages/messages.ts";

export interface DialogStep {
  id: number;
  text: string;
  done: boolean;
}

export interface DialogProps {
  open: boolean;
  tab: Tab;
  assetIndex: number;
  config: Config | null;
  position: Position | null;
  market: MarketRates | null;
  walletVusd: bigint;
  walletCollateral: Record<string, bigint>;
  messages: Record<string, ActionMessage>;
  steps: DialogStep[];
  busy: string | null;
  isOracleFrozen?: boolean;
  onTab: (tab: Tab) => void;
  onAsset: (index: number) => void;
  onClose: () => void;
  onSupply: (asset: Collateral, amount: string) => void;
  onBorrow: (amount: string) => void;
  onRepay: (amount: string) => void;
  onRepayAll: () => void;
  onWithdraw: (asset: Collateral, amount: string) => void;
  onMintToken?: (assetAddress: string, name: string) => void;
  onUnfreezeOracle?: () => void;
}

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "deposit", label: "Supply", icon: "📥" },
  { key: "borrow", label: "Borrow", icon: "💳" },
  { key: "repay", label: "Repay", icon: "🔄" },
  { key: "withdraw", label: "Withdraw", icon: "📤" },
];

export function ActionDialog(p: DialogProps) {
  const [amount, setAmount] = useState("");

  // Handle ESC key to close modal
  useEffect(() => {
    if (!p.open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") p.onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [p.open, p.onClose]);

  // Reset amount when switching tabs or changing collateral asset
  useEffect(() => {
    setAmount("");
  }, [p.tab, p.assetIndex]);

  if (!p.open) return null;

  const collateral = p.config?.collaterals[p.assetIndex];
  const decimals = p.config?.debtDecimals ?? 6;
  const pos = p.position;

  const msg = (id: string) => p.messages[id];
  const MessageLine = ({ id }: { id: string }) => {
    const m = msg(id);
    return m ? (
      <div className={`action-msg ${m.kind === "good" ? "good" : m.kind === "error" ? "error" : "busy"}`}>
        {m.kind === "busy" && <span className="action-spinner" />}
        <span>{m.text}</span>
      </div>
    ) : null;
  };

  // Helper to format clean numeric strings without commas for the input box
  const formatClean = (units: bigint, dec: number): string => {
    if (units <= 0n) return "";
    const raw = ethers.formatUnits(units, dec);
    return raw.includes(".") ? raw.replace(/\.?0+$/, "") : raw;
  };

  // Maximum and capacities for each tab
  let maxUnits = 0n;
  let maxDisplay = "0.00";
  let activeTicker = "vUSD";
  let activeDecimals = decimals;

  if (p.tab === "deposit" && collateral) {
    maxUnits = p.walletCollateral[collateral.address.toLowerCase()] ?? 0n;
    activeDecimals = collateral.decimals;
    activeTicker = tokenInfo(collateral.name).ticker;
    maxDisplay = fmt(maxUnits, activeDecimals, 4);
  } else if (p.tab === "borrow" && pos) {
    maxUnits = borrowCapacity(pos);
    activeDecimals = decimals;
    activeTicker = "vUSD";
    maxDisplay = fmt(maxUnits, activeDecimals, 2);
  } else if (p.tab === "repay" && pos) {
    const debt = pos.debt;
    maxUnits = debt < p.walletVusd ? debt : p.walletVusd;
    activeDecimals = decimals;
    activeTicker = "vUSD";
    maxDisplay = fmt(maxUnits, activeDecimals, 2);
  } else if (p.tab === "withdraw" && collateral && pos) {
    maxUnits = maxWithdrawable(pos, collateral.address);
    activeDecimals = collateral.decimals;
    activeTicker = tokenInfo(collateral.name).ticker;
    maxDisplay = fmt(maxUnits, activeDecimals, 4);
  }

  // Parse currently entered amount
  const typedUnits = parseFree(amount, activeDecimals);

  // Quick percent applicator
  const applyPercent = (pct: number) => {
    if (maxUnits <= 0n) return;
    if (pct === 100) {
      setAmount(formatClean(maxUnits, activeDecimals));
    } else {
      const portion = (maxUnits * BigInt(pct)) / 100n;
      setAmount(formatClean(portion, activeDecimals));
    }
  };

  // Current Health Factor & Projected Risk Simulator
  const currentHF = pos ? healthFactor(pos) : null;
  let projectedHF: number | null = null;
  let projectedLimitUsed = pos ? limitUsedPercent(pos) : 0;
  let borrowLimitLeft = pos ? borrowCapacity(pos) : 0n;

  if (pos && p.tab === "borrow") {
    if (typedUnits > 0n) {
      projectedHF = healthAfterBorrow(pos, typedUnits);
      borrowLimitLeft = maxUnits > typedUnits ? maxUnits - typedUnits : 0n;
      const newDebtValue = ((pos.debt + typedUnits) * 10n ** BigInt(18 - pos.debtDecimals) * pos.debtPrice) / ONE;
      projectedLimitUsed = pos.weighted > 0n ? Math.min(Number((newDebtValue * 10000n) / pos.weighted) / 100, 100) : 100;
    } else {
      projectedHF = currentHF;
      borrowLimitLeft = maxUnits;
    }
  } else if (pos && p.tab === "deposit" && collateral) {
    if (typedUnits > 0n) {
      const price = pos.assets.find((a) => a.address.toLowerCase() === collateral.address.toLowerCase())?.price ?? null;
      if (price !== null) {
        const after = afterSupply(
          pos,
          { decimals: collateral.decimals, liqThresholdBps: collateral.liqThresholdBps, price },
          typedUnits
        );
        projectedHF = after.health;
        borrowLimitLeft = after.capacity;
      }
    }
  }

  const hfStatus = (hf: number | null) => {
    if (hf === null) return { text: "No Debt", class: "hf-safe" };
    if (hf >= 1.5) return { text: "Safe", class: "hf-safe" };
    if (hf >= 1.1) return { text: "Moderate", class: "hf-warn" };
    return { text: "High Risk", class: "hf-danger" };
  };

  const isOverMax = typedUnits > maxUnits && maxUnits > 0n;
  const isZero = typedUnits === 0n;
  const assetData = collateral ? tokenInfo(collateral.name) : null;

  return (
    <div
      className="action-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) p.onClose();
      }}
    >
      <div className="action-modal-card">
        {/* Header */}
        <div className="action-modal-header">
          <div className="action-modal-badge-group">
            <span className="action-modal-badge">Vigil DeFi Engine</span>
            <h3 className="action-modal-title">
              {p.tab === "deposit" && "Supply Collateral"}
              {p.tab === "borrow" && "Borrow vUSD Stablecoin"}
              {p.tab === "repay" && "Repay Debt"}
              {p.tab === "withdraw" && "Withdraw Collateral"}
            </h3>
          </div>
          <button className="action-modal-close" aria-label="Close" onClick={p.onClose}>
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="action-tabs-nav" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={p.tab === t.key}
              className={`action-tab-pill ${p.tab === t.key ? "is-active" : ""}`}
              onClick={() => p.onTab(t.key)}
            >
              <span className="action-tab-icon">{t.icon}</span>
              <span className="action-tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="action-modal-body">
          {/* Oracle Frozen Alert Banner */}
          {p.isOracleFrozen && (
            <div className="action-oracle-alert">
              <div className="action-oracle-icon">⚠️</div>
              <div className="action-oracle-content">
                <div className="action-oracle-title">Sepolia Testnet Price Feeds Need Refresh</div>
                <div className="action-oracle-desc">
                  Mock Chainlink feeds are stale (&gt;24 hours). Borrowing is paused to prevent bad debt. Update the price feeds to unfreeze borrowing.
                </div>
                {p.onUnfreezeOracle && (
                  <button
                    type="button"
                    className="action-unfreeze-btn"
                    disabled={p.busy !== null}
                    onClick={p.onUnfreezeOracle}
                  >
                    ⚡ Unfreeze Oracle (Update Feeds)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Asset Selector for Deposit & Withdraw */}
          {(p.tab === "deposit" || p.tab === "withdraw") && (
            <div className="action-field-group">
              <label className="action-field-label">Select Collateral Asset</label>
              <div className="action-asset-select-wrapper">
                <select
                  className="action-asset-select"
                  value={p.assetIndex}
                  onChange={(e) => p.onAsset(Number(e.target.value))}
                >
                  {p.config?.collaterals.map((c, i) => (
                    <option key={c.name} value={i}>
                      {tokenInfo(c.name).label} ({tokenInfo(c.name).ticker}) — {c.liqThresholdBps / 100}% LTV
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Borrow Specific: Capacity Hero Card */}
          {p.tab === "borrow" && (
            <div className="action-hero-card">
              <div className="action-hero-row">
                <span className="action-hero-label">Available Borrow Capacity</span>
                <span className="action-hero-value">{maxDisplay} vUSD</span>
              </div>
              <div className="action-hero-sub">
                Backing collateral: {dollars(pos?.collateralTotal ?? 0n)} USD value
              </div>

              {maxUnits === 0n && (
                <div className="action-empty-capacity-hint">
                  <span>💡 You have 0 borrow capacity. Deposit collateral first to borrow vUSD.</span>
                  <button
                    type="button"
                    className="action-link-btn"
                    onClick={() => p.onTab("deposit")}
                  >
                    Deposit Collateral Now →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Repay Specific: Debt Overview Card */}
          {p.tab === "repay" && pos && (
            <div className="action-hero-card">
              <div className="action-hero-row">
                <span className="action-hero-label">Outstanding Debt</span>
                <span className="action-hero-value">{fmt(pos.debt, decimals, 2)} vUSD</span>
              </div>
              <div className="action-hero-sub">
                Wallet Balance: {fmt(p.walletVusd, decimals, 2)} vUSD
              </div>
            </div>
          )}

          {/* Input & Quick Percentages */}
          <div className="action-input-box">
            <div className="action-input-header">
              <span className="action-input-title">Amount to {TABS.find((t) => t.key === p.tab)?.label}</span>
              <span className="action-input-balance">
                Max: <b>{maxDisplay}</b> {activeTicker}
              </span>
            </div>

            <div className="action-input-row">
              <input
                className="action-input-field"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                autoFocus
              />
              <div className="action-token-badge">
                <span className="action-token-dot" />
                <span className="action-token-name">{activeTicker}</span>
              </div>
            </div>

            {/* Quick Percentage Chips */}
            <div className="action-percent-chips">
              <button
                type="button"
                className="action-chip"
                onClick={() => applyPercent(25)}
                disabled={maxUnits === 0n}
              >
                25%
              </button>
              <button
                type="button"
                className="action-chip"
                onClick={() => applyPercent(50)}
                disabled={maxUnits === 0n}
              >
                50%
              </button>
              <button
                type="button"
                className="action-chip"
                onClick={() => applyPercent(75)}
                disabled={maxUnits === 0n}
              >
                75%
              </button>
              <button
                type="button"
                className="action-chip is-max"
                onClick={() => applyPercent(100)}
                disabled={maxUnits === 0n}
              >
                Max
              </button>
            </div>
          </div>

          {/* Faucet Shortcut Helper */}
          {p.tab === "deposit" && collateral && p.onMintToken && (
            <div className="action-faucet-banner">
              <span>Need test tokens for Sepolia?</span>
              <button
                type="button"
                className="action-faucet-btn"
                disabled={p.busy !== null}
                onClick={() => p.onMintToken!(collateral.address, collateral.name)}
              >
                🚰 Mint 1,000 Free {collateral.name}
              </button>
            </div>
          )}

          {p.tab === "repay" && p.config && p.onMintToken && (
            <div className="action-faucet-banner">
              <span>Need vUSD to pay down your loan?</span>
              <button
                type="button"
                className="action-faucet-btn"
                disabled={p.busy !== null}
                onClick={() => p.onMintToken!(p.config!.debt, "vUSD")}
              >
                🚰 Mint 100 Free vUSD
              </button>
            </div>
          )}

          {/* Real-Time Risk & Health Factor Radar */}
          <div className="action-simulation-card">
            <div className="action-sim-header">
              <span className="action-sim-title">Position &amp; Risk Parameters</span>
            </div>

            {p.tab === "borrow" && (
              <>
                <div className="action-sim-row">
                  <span className="action-sim-label">Health Factor</span>
                  <div className="action-sim-value-group">
                    <span className="action-sim-curr">{currentHF === null ? "–" : currentHF.toFixed(2)}</span>
                    <span className="action-sim-arrow">→</span>
                    <span className={`action-sim-projected ${hfStatus(projectedHF).class}`}>
                      {projectedHF === null ? "–" : projectedHF.toFixed(2)}
                    </span>
                    <span className={`action-hf-tag ${hfStatus(projectedHF).class}`}>
                      {hfStatus(projectedHF).text}
                    </span>
                  </div>
                </div>

                <div className="action-sim-row">
                  <span className="action-sim-label">Borrow Limit Used</span>
                  <div className="action-sim-value-group">
                    <span>{projectedLimitUsed.toFixed(1)}%</span>
                  </div>
                </div>

                <div className="action-sim-row">
                  <span className="action-sim-label">Borrow APY</span>
                  <span className="action-sim-highlight">
                    {p.market ? p.market.borrowApy.toFixed(2) + "%" : "–"}
                  </span>
                </div>

                <div className="action-sim-row">
                  <span className="action-sim-label">Remaining Capacity After</span>
                  <span>{fmt(borrowLimitLeft, decimals, 2)} vUSD</span>
                </div>
              </>
            )}

            {p.tab === "deposit" && collateral && (
              <>
                <div className="action-sim-row">
                  <span className="action-sim-label">Health Factor After</span>
                  <span className="action-sim-projected hf-safe">
                    {projectedHF === null ? (currentHF === null ? "–" : currentHF.toFixed(2)) : projectedHF.toFixed(2)}
                  </span>
                </div>
                <div className="action-sim-row">
                  <span className="action-sim-label">Liquidation Threshold (LTV)</span>
                  <span>{(collateral.liqThresholdBps / 100).toFixed(0)}%</span>
                </div>
                <div className="action-sim-row">
                  <span className="action-sim-label">Borrow Capacity After</span>
                  <span className="action-sim-highlight">{fmt(borrowLimitLeft, decimals, 2)} vUSD</span>
                </div>
              </>
            )}

            {p.tab === "repay" && (
              <>
                <div className="action-sim-row">
                  <span className="action-sim-label">Current Debt</span>
                  <span>{fmt(pos?.debt ?? 0n, decimals, 2)} vUSD</span>
                </div>
                <div className="action-sim-row">
                  <span className="action-sim-label">Health Factor</span>
                  <span className="action-sim-highlight">
                    {currentHF === null ? "–" : currentHF.toFixed(2)} (Improves as debt is repaid)
                  </span>
                </div>
              </>
            )}

            {p.tab === "withdraw" && collateral && (
              <>
                <div className="action-sim-row">
                  <span className="action-sim-label">Safety Target</span>
                  <span className="action-sim-highlight">Keeps Health Factor ≥ 1.05</span>
                </div>
                <div className="action-sim-row">
                  <span className="action-sim-label">Liquidation Threshold</span>
                  <span>{(collateral.liqThresholdBps / 100).toFixed(0)}%</span>
                </div>
              </>
            )}
          </div>

          {/* High Risk Warning */}
          {projectedHF !== null && projectedHF < 1.15 && (
            <div className="action-risk-alert">
              ⚠️ <b>Caution:</b> Your projected Health Factor ({projectedHF.toFixed(2)}) is close to the 1.00 liquidation threshold. Consider borrowing less.
            </div>
          )}

          {/* Action Submission Buttons */}
          <div className="action-cta-zone">
            {p.tab === "deposit" && collateral && (
              <>
                <button
                  type="button"
                  className="action-primary-btn"
                  disabled={p.busy !== null || isZero || isOverMax}
                  onClick={() => p.onSupply(collateral, amount)}
                >
                  {p.busy === "deposit"
                    ? "Supplying Collateral…"
                    : isOverMax
                    ? `Insufficient ${assetData?.ticker || "Balance"}`
                    : isZero
                    ? "Enter an Amount"
                    : `Supply ${amount} ${assetData?.ticker || ""}`}
                </button>
                <MessageLine id="deposit" />
              </>
            )}

            {p.tab === "borrow" && (
              <>
                {p.isOracleFrozen ? (
                  <button
                    type="button"
                    className="action-primary-btn is-warning"
                    disabled={p.busy !== null}
                    onClick={p.onUnfreezeOracle}
                  >
                    {p.busy ? "Updating Oracle Feeds…" : "⚡ Unfreeze Oracle to Enable Borrowing"}
                  </button>
                ) : maxUnits === 0n ? (
                  <button
                    type="button"
                    className="action-primary-btn is-secondary"
                    onClick={() => p.onTab("deposit")}
                  >
                    📥 Supply Collateral to Unlock Borrowing
                  </button>
                ) : (
                  <button
                    type="button"
                    className="action-primary-btn"
                    disabled={p.busy !== null || isZero || isOverMax}
                    onClick={() => p.onBorrow(amount)}
                  >
                    {p.busy === "borrow"
                      ? "Submitting Borrow Transaction…"
                      : isOverMax
                      ? "Amount Exceeds Borrow Capacity"
                      : isZero
                      ? "Enter an Amount"
                      : `Borrow ${amount} vUSD`}
                  </button>
                )}
                <MessageLine id="borrow" />
              </>
            )}

            {p.tab === "repay" && (
              <>
                <button
                  type="button"
                  className="action-primary-btn"
                  disabled={p.busy !== null || isZero || isOverMax}
                  onClick={() => p.onRepay(amount)}
                >
                  {p.busy === "repay"
                    ? "Repaying Loan…"
                    : isOverMax
                    ? "Insufficient vUSD Balance"
                    : isZero
                    ? "Enter an Amount"
                    : `Repay ${amount} vUSD`}
                </button>
                <MessageLine id="repay" />

                <div className="action-repay-all-section">
                  <div className="action-repay-all-desc">
                    Repay your total loan balance and withdraw all collateral in a single coordinated flow.
                  </div>
                  <button
                    type="button"
                    className="action-secondary-btn"
                    disabled={p.busy !== null}
                    onClick={p.onRepayAll}
                  >
                    ⚡ Repay All &amp; Withdraw Collateral
                  </button>

                  {p.steps.length > 0 && (
                    <div className="action-steps-tracker">
                      {p.steps.map((s) => (
                        <div key={s.id} className={`action-step-item ${s.done ? "is-done" : "is-active"}`}>
                          <span className="action-step-bullet">{s.done ? "✓" : "○"}</span>
                          <span>{s.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <MessageLine id="repayAll" />
                </div>
              </>
            )}

            {p.tab === "withdraw" && collateral && (
              <>
                <button
                  type="button"
                  className="action-primary-btn"
                  disabled={p.busy !== null || isZero || isOverMax}
                  onClick={() => p.onWithdraw(collateral, amount)}
                >
                  {p.busy === "withdraw"
                    ? "Withdrawing Collateral…"
                    : isOverMax
                    ? "Amount Exceeds Safe Withdrawable"
                    : isZero
                    ? "Enter an Amount"
                    : `Withdraw ${amount} ${assetData?.ticker || ""}`}
                </button>
                <MessageLine id="withdraw" />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Parses typed text without throwing, for live previews.
function parseFree(text: string, decimals: number): bigint {
  const t = text.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(t) || t === "." || t === "") return 0n;
  const frac = t.split(".")[1] ?? "";
  if (frac.length > decimals) return 0n;
  const [whole, fractional = ""] = t.split(".");
  return BigInt((whole || "0") + fractional.padEnd(decimals, "0"));
}
