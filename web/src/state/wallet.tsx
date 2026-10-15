// Dedicated Web3 Wallet State and Connection Provider for Vigil Protocol on Ethereum Sepolia.
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { provider, RPC_URL, getInjectedProvider } from "../lib/chain.ts";
import { useToast } from "./toasts.tsx";
import { short } from "../lib/format.ts";
import { ConnectWalletModal } from "../components/ConnectWalletModal.tsx";

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_HEX = "0xaa36a7";

export interface WalletContextType {
  account: string | null;
  chainId: number | null;
  isSepolia: boolean;
  isConnecting: boolean;
  hasInjected: boolean;
  ethBalance: string | null;
  error: string | null;
  isDemoMode: boolean;
  showModal: boolean;
  openModal: () => void;
  closeModal: () => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<boolean>;
  inspectAddress: (address: string) => void;
  clearError: () => void;
}

const WalletContext = createContext<WalletContextType | null>(null);

const STORAGE_KEY = "vigil_wallet_connected";
const DEMO_KEY = "vigil_demo_address";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [ethBalance, setEthBalance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [hasInjected, setHasInjected] = useState(() => Boolean(getInjectedProvider()));

  const toast = useToast();

  // Dynamically check and monitor for injected Web3 provider (MetaMask / EIP-6963)
  useEffect(() => {
    const detect = () => {
      const p = getInjectedProvider();
      const detected = Boolean(p);
      setHasInjected(detected);
      return detected;
    };

    detect();

    // Listen to standard extension initialization events
    const onInit = () => detect();
    window.addEventListener("ethereum#initialized", onInit, { once: true });
    window.addEventListener("eip6963:announceProvider", onInit);

    // Poll for up to 3 seconds for asynchronous script injection
    let attempts = 0;
    const poller = setInterval(() => {
      attempts++;
      if (detect() || attempts > 15) {
        clearInterval(poller);
      }
    }, 200);

    return () => {
      window.removeEventListener("ethereum#initialized", onInit);
      window.removeEventListener("eip6963:announceProvider", onInit);
      clearInterval(poller);
    };
  }, []);

  // Fetch native Sepolia ETH balance for the active account
  const refreshBalance = useCallback(async (addr: string) => {
    try {
      const bal = await provider.getBalance(addr);
      setEthBalance(Number(ethers.formatEther(bal)).toFixed(4));
    } catch {
      setEthBalance(null);
    }
  }, []);

  // Switch or prompt to add Sepolia network
  const switchNetwork = useCallback(async (): Promise<boolean> => {
    const eth = getInjectedProvider();
    if (!eth) return false;
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_HEX }],
      });
      return true;
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 4902) {
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: SEPOLIA_HEX,
                chainName: "Ethereum Sepolia",
                nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: [RPC_URL],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              },
            ],
          });
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }, []);

  // Connect to MetaMask or injected Web3 wallet
  const connect = useCallback(async () => {
    setError(null);
    const eth = getInjectedProvider();
    if (!eth) {
      setShowModal(true);
      setError("No Web3 wallet detected in your browser. Install MetaMask or explore with our demo account.");
      toast.push(
        "No Web3 Wallet Detected",
        "Please install MetaMask or explore with our Sepolia demo account.",
        "error"
      );
      return;
    }

    setIsConnecting(true);
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts selected in wallet.");
      }
      const rawChain = (await eth.request({ method: "eth_chainId" })) as string;
      const currentChain = parseInt(rawChain, 16);
      setChainId(currentChain);

      if (currentChain !== SEPOLIA_CHAIN_ID) {
        toast.push("Switching Network", "Please approve switching to Sepolia in your wallet.", "busy");
        const switched = await switchNetwork();
        if (switched) {
          toast.push("Network Switched", "Connected to Ethereum Sepolia.", "good");
        }
        const updatedChain = (await eth.request({ method: "eth_chainId" })) as string;
        setChainId(parseInt(updatedChain, 16));
      }

      const activeAccount = accounts[0].toLowerCase();
      setAccount(activeAccount);
      setIsDemoMode(false);
      setShowModal(false);
      localStorage.setItem(STORAGE_KEY, "true");
      localStorage.removeItem(DEMO_KEY);
      await refreshBalance(activeAccount);
      toast.push("Wallet Connected", `Connected to ${short(activeAccount)} on Sepolia`, "good");
    } catch (err: unknown) {
      const errObj = err as { code?: number; message?: string };
      let msg = errObj?.message ?? "Failed to connect wallet";
      if (errObj?.code === 4001) {
        msg = "Connection request was cancelled in your wallet.";
        toast.push("Connection Cancelled", msg, "error");
      } else if (errObj?.code === -32002) {
        msg = "MetaMask approval is already pending. Please click the MetaMask extension icon in your browser toolbar to approve.";
        toast.push("Approval Pending", msg, "busy");
      } else {
        toast.push("Connection Failed", msg, "error");
      }
      setError(msg);
    } finally {
      setIsConnecting(false);
    }
  }, [switchNetwork, refreshBalance, toast]);

  const disconnect = useCallback(() => {
    setAccount(null);
    setEthBalance(null);
    setIsDemoMode(false);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(DEMO_KEY);
    toast.push("Wallet Disconnected", "Disconnected from Vigil Protocol.", "good");
  }, [toast]);

  // Inspect any address in read-only mode without needing a wallet
  const inspectAddress = useCallback((addr: string) => {
    const trimmed = addr.trim().toLowerCase();
    if (!ethers.isAddress(trimmed)) {
      setError("Invalid Ethereum address");
      toast.push("Invalid Address", "Please provide a valid 0x Ethereum address.", "error");
      return;
    }
    setAccount(trimmed);
    setIsDemoMode(true);
    setError(null);
    setShowModal(false);
    localStorage.setItem(DEMO_KEY, trimmed);
    refreshBalance(trimmed);
    toast.push("Inspecting Address", `Loaded ${short(trimmed)} in read-only mode.`, "good");
  }, [refreshBalance, toast]);

  // Auto-connect on page load if previously connected or if demo address was saved
  useEffect(() => {
    const savedDemo = localStorage.getItem(DEMO_KEY);
    if (savedDemo && ethers.isAddress(savedDemo)) {
      setAccount(savedDemo);
      setIsDemoMode(true);
      refreshBalance(savedDemo);
      return;
    }

    const eth = getInjectedProvider();
    if (!eth) return;

    const wasConnected = localStorage.getItem(STORAGE_KEY) === "true";
    if (wasConnected) {
      eth.request({ method: "eth_accounts" })
        .then((accs) => {
          const list = accs as string[];
          if (list && list.length > 0) {
            const active = list[0].toLowerCase();
            setAccount(active);
            setIsDemoMode(false);
            refreshBalance(active);
            eth.request({ method: "eth_chainId" }).then((c) => {
              setChainId(parseInt(c as string, 16));
            });
          }
        })
        .catch(() => {});
    }

    const handleAccountsChanged = (accs: unknown) => {
      const list = accs as string[];
      if (!list || list.length === 0) {
        disconnect();
      } else {
        const next = list[0].toLowerCase();
        setAccount(next);
        setIsDemoMode(false);
        refreshBalance(next);
      }
    };

    const handleChainChanged = (c: unknown) => {
      setChainId(parseInt(c as string, 16));
    };

    eth.on?.("accountsChanged", handleAccountsChanged);
    eth.on?.("chainChanged", handleChainChanged);

    return () => {
      eth.removeListener?.("accountsChanged", handleAccountsChanged);
      eth.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [hasInjected, disconnect, refreshBalance]);

  const isSepolia = chainId === SEPOLIA_CHAIN_ID || isDemoMode;

  return (
    <WalletContext.Provider
      value={{
        account,
        chainId,
        isSepolia,
        isConnecting,
        hasInjected,
        ethBalance,
        error,
        isDemoMode,
        showModal,
        openModal: () => setShowModal(true),
        closeModal: () => setShowModal(false),
        connect,
        disconnect,
        switchNetwork,
        inspectAddress,
        clearError: () => setError(null),
      }}
    >
      {children}
      <ConnectWalletModal />
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
