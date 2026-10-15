// Interactive, friendly Connect Wallet & Onboarding Modal for Vigil Protocol.
// Allows connecting MetaMask, installing MetaMask if missing, or exploring any Sepolia address in read-only mode.
import { useState } from "react";
import { useWallet } from "../state/wallet.tsx";

const DEMO_SEPOLIA_ACCOUNT = "0xfd6F2917fBbB36E45E9FCeB1b9a6366f40016065";

export function ConnectWalletModal() {
  const wallet = useWallet();
  const [customAddress, setCustomAddress] = useState("");

  if (!wallet.showModal) return null;

  const handleInspect = (addr: string) => {
    if (addr.trim()) {
      wallet.inspectAddress(addr.trim());
      wallet.closeModal();
    }
  };

  return (
    <div className="modal-backdrop" onClick={wallet.closeModal}>
      <div className="modal-card wallet-connect-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header-row">
          <div className="modal-title">Connect to Vigil</div>
          <button className="modal-close-btn" onClick={wallet.closeModal} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="modal-desc">
          Connect your Web3 wallet to supply collateral, borrow synthetic vUSD, or explore live positions on Ethereum Sepolia.
        </p>

        {/* Error notification banner if any connection error occurred */}
        {wallet.error && (
          <div className="wallet-modal-alert">
            <div className="alert-content">
              <span className="alert-icon">⚠️</span>
              <span className="alert-text">{wallet.error}</span>
            </div>
            <button className="alert-dismiss" onClick={wallet.clearError}>
              Dismiss
            </button>
          </div>
        )}

        <div className="wallet-options-list">
          {/* Option 1: Browser Web3 Wallet (MetaMask) */}
          <div className={`wallet-option-card ${wallet.hasInjected ? "available" : "unavailable"}`}>
            <div className="wallet-option-header">
              <div className="wallet-option-icon-wrap">
                <svg className="wallet-icon-svg" viewBox="0 0 32 32" fill="none">
                  <path d="M28 8H4C2.9 8 2 8.9 2 10V22C2 23.1 2.9 24 4 24H28C29.1 24 30 23.1 30 22V10C30 8.9 29.1 8 28 8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2 13H30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="24" cy="18.5" r="1.5" fill="currentColor" />
                </svg>
              </div>
              <div className="wallet-option-info">
                <div className="wallet-option-title-row">
                  <span className="wallet-option-title">Browser Wallet (MetaMask)</span>
                  {wallet.hasInjected ? (
                    <span className="status-badge ready">Detected</span>
                  ) : (
                    <span className="status-badge missing">Not Installed</span>
                  )}
                </div>
                <div className="wallet-option-desc">
                  {wallet.hasInjected
                    ? "Connect via your browser extension to sign transactions on Sepolia."
                    : "No Web3 wallet extension was detected in your current browser."}
                </div>
              </div>
            </div>

            <div className="wallet-option-action">
              {wallet.hasInjected ? (
                <button
                  className="btn-modal-action-primary"
                  onClick={() => wallet.connect()}
                  disabled={wallet.isConnecting}
                >
                  {wallet.isConnecting ? "Connecting… Check Extension" : "Connect MetaMask"}
                </button>
              ) : (
                <a
                  className="btn-modal-action-secondary"
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Install MetaMask ↗
                </a>
              )}
            </div>
          </div>

          <div className="wallet-modal-divider">
            <span>OR EXPLORE INSTANTLY</span>
          </div>

          {/* Option 2: Explore Demo Sepolia Account (Read-Only) */}
          <div className="wallet-option-card demo-card">
            <div className="wallet-option-header">
              <div className="wallet-option-icon-wrap demo-icon">
                <svg className="wallet-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <div className="wallet-option-info">
                <div className="wallet-option-title-row">
                  <span className="wallet-option-title">Explore Sepolia Account (Read-Only)</span>
                  <span className="status-badge demo">Instant Access</span>
                </div>
                <div className="wallet-option-desc">
                  Inspect active loans, collateral ratios, and health factor metrics on Sepolia without a wallet.
                </div>
              </div>
            </div>

            <div className="demo-actions-row">
              <button
                className="btn-modal-demo-quick"
                onClick={() => handleInspect(DEMO_SEPOLIA_ACCOUNT)}
              >
                ⚡ Use Sample Account ({DEMO_SEPOLIA_ACCOUNT.slice(0, 6)}…{DEMO_SEPOLIA_ACCOUNT.slice(-4)})
              </button>
            </div>

            <div className="custom-inspect-box">
              <input
                type="text"
                placeholder="Or paste any address: 0x..."
                className="modal-input-compact"
                value={customAddress}
                onChange={(e) => setCustomAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleInspect(customAddress);
                }}
              />
              <button
                className="btn-custom-inspect"
                disabled={!customAddress.trim()}
                onClick={() => handleInspect(customAddress)}
              >
                Inspect
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer-note">
          <span>Connected to Ethereum Sepolia Testnet (Chain ID 11155111). All protocol smart contracts are live and verified.</span>
        </div>
      </div>
    </div>
  );
}
