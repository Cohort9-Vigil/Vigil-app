// Everything that talks to the chain directly: the RPC connection, contract ABIs and transactions.
import { ethers } from "ethers";

// Set VITE_RPC_URL at build time to point the app at another chain. Sepolia is the default.
export const RPC_URL = import.meta.env.VITE_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
export const provider = new ethers.JsonRpcProvider(RPC_URL, undefined, { staticNetwork: true });
export const MAX_UINT = ethers.MaxUint256;

// The functions this page calls on the pool and the tokens.
export const POOL_ABI = [
  "function depositCollateral(address asset, uint256 amount)",
  "function withdrawCollateral(address asset, uint256 amount)",
  "function borrow(uint256 amount)",
  "function repay(uint256 amount)",
  "function supply(uint256 amount)",
  "function withdrawSupply(uint256 amount)",
  "function setCollateralEnabled(address asset, bool enabled)",
  "function nonceUsed(address user, uint256 nonce) view returns (bool)",
  "function getHealthFactor(address user) view returns (uint256)",
  "function getDebt(address user) view returns (uint256)",
  "function getCollateralBalance(address user, address asset) view returns (uint256)",
];
export const SETTLEMENT_ABI = [
  "function nonceBitmap(address user, uint256 word) view returns (uint256)",
  "function currentBonusBps(address borrower) view returns (uint256)",
  "function auctionStartBlock(address borrower) view returns (uint256)",
  "function startAuction(address borrower)",
  "function executeLiquidation((address,address,uint256,uint256,uint256,uint256),bytes)",
];
export const TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
];
export const ORACLE_ABI = [
  "function state() view returns (uint8)",
  "function getPrice(address asset) view returns (uint256)",
  "function sources(address asset) view returns (address feed, uint8 feedDecimals, uint32 maxStaleness, uint32 twapWindow, uint16 maxDeviationBps, address twapSource, int128 minAnswer, int128 maxAnswer)",
];
export const MOCK_FEED_ABI = [
  "function answer() view returns (int128)",
  "function updatedAt() view returns (uint96)",
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function setAnswer(int128 newAnswer)",
  "function setUpdatedAt(uint96 newUpdatedAt)",
];

// The shape of a liquidation intent. The signature covers exactly these fields.
export const INTENT_TYPES = {
  LiquidationIntent: [
    { name: "borrower", type: "address" },
    { name: "collateralAsset", type: "address" },
    { name: "maxRepay", type: "uint256" },
    { name: "minCollateralOut", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

// Safely returns the active injected EIP-1193 Web3 provider (e.g. MetaMask).
// Handles multiple wallet extensions (MetaMask, Coinbase, Phantom, etc.) by prioritizing MetaMask.
export function getInjectedProvider(): (ethers.Eip1193Provider & { request: (args: unknown) => Promise<unknown>; on?: (event: string, handler: (...args: unknown[]) => void) => void; removeListener?: (event: string, handler: (...args: unknown[]) => void) => void; isMetaMask?: boolean }) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    ethereum?: any;
  };
  if (!w.ethereum) return null;
  if (Array.isArray(w.ethereum.providers) && w.ethereum.providers.length > 0) {
    const mm = w.ethereum.providers.find((p: any) => p?.isMetaMask);
    return (mm || w.ethereum.providers[0]) as any;
  }
  return w.ethereum as any;
}

// Returns a signer for transactions. If a browser wallet (e.g. MetaMask) is connected,
// it uses the browser provider; otherwise falls back to the RPC provider.
export async function getSigner(from?: string): Promise<ethers.Signer> {
  const injected = getInjectedProvider();
  if (injected) {
    const browser = new ethers.BrowserProvider(injected);
    return await browser.getSigner(from);
  }
  return await provider.getSigner(from);
}

// Sends a transaction from `from` and waits until it is mined.
// The gas limit is the node's estimate plus 30%: the estimate can come out too low when interest
// accrues between estimating and mining, which made some repayments run out of gas.
export async function sendTransaction(
  from: string,
  contract: ethers.Contract,
  method: string,
  args: unknown[],
): Promise<ethers.ContractTransactionReceipt | null> {
  const signer = await getSigner(from);
  const connected = contract.connect(signer) as ethers.Contract;
  const gasLimit = ((await connected.getFunction(method).estimateGas(...args)) * 13n) / 10n;
  const tx = await connected.getFunction(method)(...args, { gasLimit });
  return tx.wait();
}

// Approves a token for the spender, but only when the current allowance is too small.
export async function approveIfNeeded(
  from: string,
  token: ethers.Contract,
  spender: string,
  amount: bigint,
): Promise<void> {
  const current: bigint = await token.allowance(from, spender);
  if (current < amount) {
    await sendTransaction(from, token, "approve", [spender, amount]);
  }
}

// Turns typed text into whole units. Throws a clear message when the text is not a valid amount.
export function parseAmount(text: string, decimals: number, allowZero = false): bigint {
  const typed = text.trim();
  if (typed === "") throw new Error("enter an amount");
  if (!/^\d*\.?\d*$/.test(typed) || typed === ".") throw new Error("the amount must be a number");
  const decimalPart = typed.split(".")[1] ?? "";
  if (decimalPart.length > decimals) throw new Error(`at most ${decimals} decimal places`);
  const units = ethers.parseUnits(typed, decimals);
  if (units === 0n && !allowZero) throw new Error("the amount must be above zero");
  return units;
}

// A short, readable reason for a failed transaction.
export function reasonOf(err: unknown): string {
  const e = err as any;
  const reason = e?.reason || e?.shortMessage || e?.info?.error?.message || e?.data?.message || e?.message || "something went wrong";
  const errStr = String(reason) + " " + JSON.stringify(e || {});

  if (errStr.includes("0x9af506b8") || errStr.includes("OracleFrozen")) {
    return "Oracle Frozen: Testnet price feeds have not updated in >24h. Please click 'Refresh Price Feeds' to unfreeze borrowing.";
  }
  if (errStr.includes("0xcd215006") || errStr.includes("InvalidPrice")) {
    return "Oracle price feed reported an invalid or stale price.";
  }
  if (errStr.includes("InsufficientLiquidity") || errStr.includes("0xbb557f33")) {
    return "The pool does not have enough liquidity available for this borrow amount.";
  }
  if (errStr.includes("HealthFactorTooLow") || errStr.includes("0x48e12d4a")) {
    return "Borrowing this amount would put your Health Factor below 1.0 (liquidation threshold). Please borrow less or supply more collateral.";
  }
  if (errStr.includes("user rejected") || errStr.includes("ACTION_REJECTED") || e?.code === 4001) {
    return "Transaction was cancelled in your wallet.";
  }
  if (reason.includes("reverted")) {
    return "The smart contract reverted the transaction. Check your collateral balance and borrow capacity.";
  }
  return reason;
}
