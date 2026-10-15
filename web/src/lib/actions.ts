// The things a user can do on the page. Each one checks the numbers first, then sends the transaction.
// The UI shows the messages these functions throw.
import { ethers } from "ethers";
import { approveIfNeeded, MAX_UINT, parseAmount, sendTransaction, MOCK_FEED_ABI, provider } from "./chain.ts";
import { fetchAccount } from "./api.ts";
import { borrowCapacity, calculatePosition, maxWithdrawable, type Position } from "./position.ts";
import { fmt } from "./format.ts";
import { tokenInfo } from "./tokens.ts";
import type { AccountView, Collateral, Config } from "./types.ts";
import type { Contracts } from "../state/hooks.ts";

export interface ActionContext {
  who: string;
  contracts: Contracts;
  account: AccountView;
  walletVusd: bigint;
  walletCollateral: Record<string, bigint>;
  position: Position;
  fallbackDebtPrice: bigint;
  reload: () => Promise<void>;
}

// Test tokens only. The vUSD is for paying interest, which grows every block.
export async function mintTestTokens(ctx: ActionContext): Promise<string> {
  const { who, contracts } = ctx;
  for (const c of contracts.config.collaterals) {
    await sendTransaction(who, contracts.tokens[c.address.toLowerCase()], "mint", [who, ethers.parseUnits("1000", c.decimals)]);
  }
  await sendTransaction(who, contracts.debtToken, "mint", [who, ethers.parseUnits("100", contracts.config.debtDecimals)]);
  return " 1000 of each collateral and 100 vUSD minted.";
}

// Mint a specific collateral or debt token directly in a single transaction
export async function mintSingleToken(ctx: ActionContext, assetAddress: string, amountText = "1000"): Promise<string> {
  const { who, contracts } = ctx;
  const isDebt = assetAddress.toLowerCase() === contracts.config.debt.toLowerCase();
  if (isDebt) {
    const decimals = contracts.config.debtDecimals;
    const amount = ethers.parseUnits(amountText, decimals);
    await sendTransaction(who, contracts.debtToken, "mint", [who, amount]);
    return ` Minted ${amountText} vUSD to your wallet.`;
  }
  const collateral = contracts.config.collaterals.find(
    (c) => c.address.toLowerCase() === assetAddress.toLowerCase(),
  );
  if (!collateral) throw new Error("Unknown token address");
  const contract = contracts.tokens[assetAddress.toLowerCase()];
  const amount = ethers.parseUnits(amountText, collateral.decimals);
  await sendTransaction(who, contract, "mint", [who, amount]);
  return ` Minted ${amountText} ${collateral.name} to your wallet.`;
}

export async function supply(ctx: ActionContext, asset: Collateral, text: string): Promise<string> {
  const { who, contracts } = ctx;
  const token = tokenInfo(asset.name);
  const key = asset.address.toLowerCase();
  const amount = parseAmount(text, asset.decimals);
  if (amount > (ctx.walletCollateral[key] ?? 0n)) throw new Error(`you do not have that much ${token.ticker} in your wallet`);
  await approveIfNeeded(who, contracts.tokens[key], contracts.config.pool, amount);
  await sendTransaction(who, contracts.pool, "depositCollateral", [asset.address, amount]);
  return ` ${token.label} is now held by the pool.`;
}

export async function borrow(ctx: ActionContext, text: string): Promise<string> {
  const { who, contracts, position } = ctx;
  const dec = contracts.config.debtDecimals;
  const amount = parseAmount(text, dec);
  const capacity = borrowCapacity(position);
  if (capacity === 0n) throw new Error("you cannot borrow more right now. Add collateral or repay some debt first");
  if (amount > capacity) throw new Error(`that is above your capacity of ${fmt(capacity, dec)} vUSD`);
  await sendTransaction(who, contracts.pool, "borrow", [amount]);
  return " The vUSD is in your wallet.";
}

export async function repay(ctx: ActionContext, text: string): Promise<string> {
  const { who, contracts } = ctx;
  const amount = parseAmount(text, contracts.config.debtDecimals);
  await approveIfNeeded(who, contracts.debtToken, contracts.config.pool, amount);
  await sendTransaction(who, contracts.pool, "repay", [amount]);
  return "";
}

export async function withdraw(ctx: ActionContext, asset: Collateral, text: string): Promise<string> {
  const { who, contracts, position } = ctx;
  const token = tokenInfo(asset.name);
  const amount = parseAmount(text, asset.decimals);
  const most = maxWithdrawable(position, asset.address);
  if (most === 0n) throw new Error("nothing can be taken out right now without the health factor dropping below 1.05. Repay some debt first");
  if (amount > most) throw new Error(`the most you can take out is ${fmt(most, asset.decimals, 4)} ${token.ticker}`);
  await sendTransaction(who, contracts.pool, "withdrawCollateral", [asset.address, amount]);
  return ` ${token.label} is back in your wallet.`;
}

// Repays the whole debt, then gives back every collateral the pool holds for this account.
// `step` adds a line to the progress list and returns a function that marks it done.
export async function repayAllAndReturn(
  ctx: ActionContext,
  step: (text: string) => () => void,
): Promise<string> {
  const { who, contracts } = ctx;
  const dec = contracts.config.debtDecimals;
  const debt = BigInt(ctx.account.debt);

  if (debt > 0n) {
    if (ctx.walletVusd < debt) {
      throw new Error(`you need ${fmt(debt - ctx.walletVusd, dec, 6)} more vUSD. Interest grows every block, so get the difference from the test tokens button or another account`);
    }
    const approved = step("Approving vUSD for the full debt");
    await approveIfNeeded(who, contracts.debtToken, contracts.config.pool, MAX_UINT);
    approved();
    const repaid = step("Repaying the full debt, with interest");
    await sendTransaction(who, contracts.pool, "repay", [MAX_UINT]);
    repaid();
  }

  // Read the position again, now that the debt is gone.
  const fresh = await fetchAccount(who);
  const left = BigInt(fresh.debt);
  if (left > 0n) throw new Error("some debt is still open, try again");

  const returned = fresh.collaterals.filter((c) => BigInt(c.amount) > 0n);
  for (const c of returned) {
    const token = tokenInfo(c.name);
    const done = step(`Returning ${fmt(BigInt(c.amount), c.decimals, 4)} ${token.ticker} to your wallet`);
    await sendTransaction(who, contracts.pool, "withdrawCollateral", [c.address, BigInt(c.amount)]);
    done();
  }
  await ctx.reload();
  return returned.length ? ` ${returned.length} collateral asset(s) returned.` : " Nothing left to return.";
}

// Builds the position for a fresh account read. Used by the repay-all flow.
export function positionFor(view: AccountView, fallbackDebtPrice: bigint): Position {
  return calculatePosition(view, fallbackDebtPrice);
}

// Unfreezes the testnet oracle by refreshing timestamps on the mock price feeds on Sepolia
export async function unfreezeOracleFeeds(
  ctx: ActionContext,
  step?: (text: string) => () => void,
): Promise<string> {
  const { who, contracts } = ctx;
  const feeds: { name: string; address: string; fallbackAnswer: bigint }[] = [
    {
      name: "vUSD",
      address: contracts.config.debtFeed || "0x8E6ca1c742E173de3187f8a78b24Cb4EF603A1eB",
      fallbackAnswer: 100000000n,
    },
  ];
  for (const c of contracts.config.collaterals) {
    if (c.feed) {
      const fallback = c.name.toLowerCase().includes("fee")
        ? 10000000000n
        : c.name.toLowerCase().includes("six")
        ? 5000000000n
        : 2000000000000n;
      feeds.push({ name: c.name, address: c.feed, fallbackAnswer: fallback });
    }
  }

  for (const f of feeds) {
    const done = step ? step(`Refreshing ${f.name} price feed`) : () => {};
    const feedContract = new ethers.Contract(f.address, MOCK_FEED_ABI, provider);
    let answerToSet = f.fallbackAnswer;
    try {
      const current = await feedContract.answer();
      if (current && current > 0n) {
        answerToSet = BigInt(current);
      }
    } catch {
      // fallback
    }
    await sendTransaction(who, feedContract, "setAnswer", [answerToSet]);
    done();
  }

  await ctx.reload();
  return "All price feeds updated. Oracle is now active and borrowing is unpaused!";
}

export type { Config };
