// Supply markets (collateral assets) and the borrow market (vUSD).
import { Sparkline } from "./Sparkline.tsx";
import { assetCell } from "./AssetCell.tsx";
import { dollars, fmt } from "../lib/format.ts";
import { tokenInfo } from "../lib/tokens.ts";
import type { MarketRates } from "../lib/rates.ts";
import type { AccountView, ChainSnapshot, Collateral, Config } from "../lib/types.ts";
import type { StreamState } from "../state/stream.tsx";

export type Tab = "deposit" | "borrow" | "repay" | "withdraw";

export function SupplyMarkets({
  config,
  chain,
  history,
  onOpen,
  query,
  walletCollateral,
  account,
  onMintToken,
  busy,
}: {
  config: Config | null;
  chain: ChainSnapshot | null;
  history: StreamState["priceHistory"];
  onOpen: (asset: Collateral, tab: Tab) => void;
  query: string;
  walletCollateral?: Record<string, bigint>;
  account?: AccountView | null;
  onMintToken?: (assetAddress: string, name: string) => void;
  busy?: string | null;
}) {
  const q = query.trim().toLowerCase();
  const shown = config?.collaterals.filter((c) => {
    if (!q) return true;
    const info = tokenInfo(c.name);
    return info.label.toLowerCase().includes(q) || info.ticker.toLowerCase().includes(q);
  });

  return (
    <section>
      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th className="num">Price</th>
              <th className="num">In Your Wallet</th>
              <th className="num">Supplied</th>
              <th className="num">Liq. Threshold</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!config && <tr><td colSpan={6} className="muted">loading…</td></tr>}
            {shown?.length === 0 && <tr><td colSpan={6} className="empty">No assets match “{query}”.</td></tr>}
            {shown?.map((c) => {
              const price = chain?.prices.find((p) => p.name.toLowerCase() === c.name.toLowerCase());
              const fallbackPriceWad = c.name.toLowerCase().includes("eight")
                ? 20000n * 10n ** 18n
                : c.name.toLowerCase().includes("fee")
                ? 100n * 10n ** 18n
                : 50n * 10n ** 18n;
              const priceWad = price && price.price_wad !== "frozen" ? BigInt(price.price_wad) : fallbackPriceWad;

              const walletBal = walletCollateral ? walletCollateral[c.address.toLowerCase()] ?? 0n : 0n;
              const suppliedBalStr = account?.collaterals.find((x) => x.address.toLowerCase() === c.address.toLowerCase())?.amount ?? "0";
              const suppliedBal = BigInt(suppliedBalStr);

              return (
                <tr key={c.name}>
                  <td>{assetCell(c.name)}</td>
                  <td className="num price-cell">{dollars(priceWad)}</td>
                  <td className="num font-mono">
                    <span className={walletBal > 0n ? "has-balance" : "zero-balance"}>
                      {fmt(walletBal, c.decimals, 2)}
                    </span>
                  </td>
                  <td className="num font-mono">
                    <span className={suppliedBal > 0n ? "has-supplied" : "zero-balance"}>
                      {fmt(suppliedBal, c.decimals, 2)}
                    </span>
                  </td>
                  <td className="num">{(c.liqThresholdBps / 100).toFixed(0)}%</td>
                  <td>
                    <div className="row-actions">
                      {onMintToken && (
                        <button
                          className="btn-sm faucet"
                          disabled={busy !== null}
                          onClick={(e) => {
                            e.stopPropagation();
                            onMintToken(c.address, c.name);
                          }}
                          title={`Mint 1,000 free test ${c.name} directly to your wallet`}
                        >
                          🚰 Mint 1k
                        </button>
                      )}
                      <button className="btn-sm" onClick={(e) => { e.stopPropagation(); onOpen(c, "deposit"); }}>Supply</button>
                      <button className="btn-sm alt" onClick={(e) => { e.stopPropagation(); onOpen(c, "withdraw"); }}>Withdraw</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function BorrowMarkets({
  config,
  chain,
  market,
  onBorrow,
  onRepay,
  walletVusd,
  account,
  onMintVusd,
  busy,
}: {
  config: Config | null;
  chain: ChainSnapshot | null;
  market: MarketRates | null;
  onBorrow: () => void;
  onRepay: () => void;
  walletVusd?: bigint;
  account?: AccountView | null;
  onMintVusd?: () => void;
  busy?: string | null;
}) {
  const debtPrice = chain && chain.debtPriceWad !== "frozen" ? BigInt(chain.debtPriceWad) : 10n ** 18n;
  const vusdBal = walletVusd ?? 0n;
  const debtBal = account ? BigInt(account.debt) : 0n;

  return (
    <section style={{ marginTop: 16 }}>
      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th className="num">Price</th>
              <th className="num">In Your Wallet</th>
              <th className="num">You Borrowed</th>
              <th className="num" title="What a borrower pays per year, including compounding">Borrow APY</th>
              <th className="num" title="Share of the pool that is borrowed">Utilization</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {!config ? (
              <tr><td colSpan={7} className="muted">loading…</td></tr>
            ) : (
              <tr>
                <td>
                  <div className="asset">
                    <span className="coin vusd">$</span>
                    <div><div className="name">vUSD</div><div className="ticker">Vigil USD</div></div>
                  </div>
                </td>
                <td className="num">{dollars(debtPrice)}</td>
                <td className="num font-mono">
                  <span className={vusdBal > 0n ? "has-balance" : "zero-balance"}>
                    {fmt(vusdBal, config.debtDecimals, 2)} vUSD
                  </span>
                </td>
                <td className="num font-mono">
                  <span className={debtBal > 0n ? "has-debt" : "zero-balance"}>
                    {fmt(debtBal, config.debtDecimals, 2)} vUSD
                  </span>
                </td>
                <td className="num">{market ? market.borrowApy.toFixed(2) + "%" : "3.50%"}</td>
                <td className="num">{market ? market.utilization.toFixed(1) + "%" : "0.0%"}</td>
                <td>
                  <div className="row-actions">
                    {onMintVusd && (
                      <button
                        className="btn-sm faucet"
                        disabled={busy !== null}
                        onClick={(e) => {
                          e.stopPropagation();
                          onMintVusd();
                        }}
                        title="Mint 100 free test vUSD directly to your wallet"
                      >
                        🚰 Mint 100
                      </button>
                    )}
                    <button className="btn-sm" onClick={onBorrow}>Borrow</button>
                    <button className="btn-sm alt" onClick={onRepay}>Repay</button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
