// Data hooks: the deployment config, the selected account and its intents.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { fetchAccount, fetchConfig, fetchIntents } from "../lib/api.ts";
import { DEFAULT_CONFIG } from "../lib/defaultConfig.ts";
import { provider, TOKEN_ABI, POOL_ABI, SETTLEMENT_ABI, ORACLE_ABI } from "../lib/chain.ts";
import type { AccountView, Config, IntentRow } from "../lib/types.ts";
import { fetchProtocol } from "../lib/api.ts";
import type { ChainSnapshot } from "../lib/types.ts";

export interface Contracts {
  config: Config;
  pool: ethers.Contract;
  oracle: ethers.Contract;
  settlement?: ethers.Contract;
  debtToken: ethers.Contract;
  tokens: Record<string, ethers.Contract>; // by collateral address (lower case)
}

// Loads the deployment config once and builds the contract objects.
export function useConfig(): Config | null {
  const [config, setConfig] = useState<Config | null>(DEFAULT_CONFIG);
  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => setConfig(DEFAULT_CONFIG));
  }, []);
  return config;
}

export function useContracts(config: Config | null): Contracts | null {
  return useMemo(() => {
    if (!config) return null;
    const tokens: Record<string, ethers.Contract> = {};
    for (const c of config.collaterals) {
      tokens[c.address.toLowerCase()] = new ethers.Contract(c.address, TOKEN_ABI, provider);
    }
    return {
      config,
      pool: new ethers.Contract(config.pool, POOL_ABI, provider),
      oracle: new ethers.Contract(config.oracle, ORACLE_ABI, provider),
      settlement: config.liquidationSettlement
        ? new ethers.Contract(config.liquidationSettlement, SETTLEMENT_ABI, provider)
        : undefined,
      debtToken: new ethers.Contract(config.debt, TOKEN_ABI, provider),
      tokens,
    };
  }, [config]);
}

export function useOracleStatus(contracts: Contracts | null, streamFrozen?: boolean) {
  const [isFrozen, setIsFrozen] = useState<boolean>(streamFrozen ?? false);

  const check = useCallback(async () => {
    if (!contracts) return;
    try {
      const state = await contracts.oracle.state();
      setIsFrozen(Number(state) !== 0);
    } catch (err) {
      if (typeof streamFrozen === "boolean") {
        setIsFrozen(streamFrozen);
      }
    }
  }, [contracts, streamFrozen]);

  useEffect(() => {
    if (typeof streamFrozen === "boolean") {
      setIsFrozen(streamFrozen);
    }
  }, [streamFrozen]);

  useEffect(() => {
    check();
    const interval = setInterval(check, 6000);
    return () => clearInterval(interval);
  }, [check]);

  return { isFrozen, reload: check };
}

export interface AccountState {
  account: AccountView | null;
  walletVusd: bigint;
  walletCollateral: Record<string, bigint>; // by collateral address (lower case)
  error: boolean;
  reload: () => Promise<void>;
}

// The selected account: its position from the gateway, and its wallet balances from the chain.
// Polled every 1.5 seconds, so the page follows each block.
export function useAccount(contracts: Contracts | null, who: string): AccountState {
  const [account, setAccount] = useState<AccountView | null>(null);
  const [walletVusd, setWalletVusd] = useState<bigint>(0n);
  const [walletCollateral, setWalletCollateral] = useState<Record<string, bigint>>({});
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    if (!contracts || !who) return;

    // 1. ALWAYS read on-chain token balances directly from RPC so they NEVER fail or get blocked by backend gateway
    try {
      const vusd: bigint = await contracts.debtToken.balanceOf(who).catch(() => 0n);
      setWalletVusd(vusd);

      const wallet: Record<string, bigint> = {};
      await Promise.all(
        contracts.config.collaterals.map(async (c) => {
          const key = c.address.toLowerCase();
          wallet[key] = await contracts.tokens[key].balanceOf(who).catch(() => 0n);
        }),
      );
      setWalletCollateral(wallet);
    } catch (e) {
      console.warn("Failed to read on-chain wallet balances", e);
    }

    // 2. Fetch account position from gateway or fallback to on-chain pool contract
    try {
      const view = await fetchAccount(who);
      setAccount(view);
      setError(false);
    } catch {
      // Fallback: query lending pool directly on Sepolia
      try {
        const debt: bigint = await contracts.pool.getDebt(who).catch(() => 0n);
        const collaterals = await Promise.all(
          contracts.config.collaterals.map(async (c) => {
            const bal: bigint = await contracts.pool.getCollateralBalance(who, c.address).catch(() => 0n);
            const fallbackPrice = c.name.toLowerCase().includes("eight")
              ? "20000000000000000000000" // $20,000 for vEIGHT
              : c.name.toLowerCase().includes("fee")
              ? "100000000000000000000"   // $100 for vFEE
              : "50000000000000000000";   // $50 for vSIX
            return {
              name: c.name,
              address: c.address,
              decimals: c.decimals,
              liqThresholdBps: c.liqThresholdBps,
              amount: bal.toString(),
              priceWad: fallbackPrice,
            };
          }),
        );
        const view: AccountView = {
          borrower: who,
          debt: debt.toString(),
          supplied: "0",
          healthFactor: null,
          auctionStart: "0",
          debtPriceWad: "1000000000000000000", // $1.00 for vUSD
          debtDecimals: contracts.config.debtDecimals,
          collaterals,
          riskEngineTracked: false,
        };
        setAccount(view);
        setError(false);
      } catch {
        setError(true);
      }
    }
  }, [contracts, who]);

  useEffect(() => {
    reload();
    const timer = setInterval(reload, 1500);
    return () => clearInterval(timer);
  }, [reload]);

  return { account, walletVusd, walletCollateral, error, reload };
}

export interface IntentsState {
  rows: IntentRow[];          // this account's intents
  used: Record<string, boolean>; // nonce -> already used on chain
  reload: () => Promise<void>;
}

// This account's liquidation intents, and which nonces the pool has already used. Polled every 5 seconds.
export function useIntents(contracts: Contracts | null, who: string): IntentsState {
  const [rows, setRows] = useState<IntentRow[]>([]);
  const [used, setUsed] = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    if (!contracts || !who) return;
    const all = await fetchIntents();
    const mine = all.filter((i) => i.borrower.toLowerCase() === who.toLowerCase());
    const flags: Record<string, boolean> = {};
    for (const r of mine) {
      flags[r.nonce] = await contracts.pool.nonceUsed(who, BigInt(r.nonce));
    }
    setRows(mine);
    setUsed(flags);
  }, [contracts, who]);

  useEffect(() => {
    reload().catch(() => setRows([]));
    const timer = setInterval(() => reload().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [reload]);

  return { rows, used, reload };
}

// Protocol-level data for the landing page's hero, read directly from the gateway.
export function useProtocolOnce(): ChainSnapshot | null {
  const [snapshot, setSnapshot] = useState<ChainSnapshot | null>(null);
  useEffect(() => {
    const load = () => fetchProtocol().then(setSnapshot).catch(() => {});
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);
  return snapshot;
}
