"use client";

/**
 * hooks/useWallet.ts
 *
 * Combines wallet context (multi-wallet management, selection, balance refresh)
 * with a wallet-provider abstraction supporting Freighter, Ledger, xBull, and
 * Albedo.  Provides a single hook for connecting/disconnecting any supported
 * wallet, formatting addresses, and aggregating balances across all managed
 * wallets.
 */

import { useCallback } from "react";
import {
  useWalletContext,
  type Wallet,
  type WalletProviderState,
} from "@/context/WalletContext";
import {
  getProvider,
  type WalletProvider,
  type WalletProviderId,
} from "@/lib/wallet-providers";
import {
  submitPaymentTransaction,
  type PaymentStatus,
  type PendingPayment,
  type SubmittedPayment,
} from "@/lib/stellar/submitTransaction";
import type {
  PaymentAsset,
  PaymentAssetIssuers,
} from "@/lib/stellar/buildPaymentTransaction";

// ── Types ─────────────────────────────────────────────────────────────────────

// The shared connection state now lives in WalletContext so the navbar and any
// payment surface observe the same connection. Re-exported for compatibility.
export type { WalletProviderState } from "@/context/WalletContext";

export interface SendPaymentInput {
  destination: string;
  amount: string;
  asset: PaymentAsset;
  memo?: string;
  assetIssuers?: PaymentAssetIssuers;
  onStatus?: (status: PaymentStatus) => void;
  onSubmitted?: (payment: PendingPayment) => void;
}

export interface UseWalletReturn {
  // Wallet context state
  wallets: Wallet[];
  selectedWallet: Wallet | null;
  isLoading: boolean;
  error: string | null;
  addWallet: (wallet: Omit<Wallet, "id" | "createdAt">) => void;
  removeWallet: (id: string) => void;
  selectWallet: (id: string) => void;
  updateWalletBalance: (id: string, balance: Wallet["balance"]) => void;
  updateWalletName: (id: string, name: string) => void;
  setDefaultWallet: (id: string) => void;
  refreshBalances: () => Promise<void>;
  // Wallet-provider state (generalised)
  walletProvider: WalletProviderState;
  connectProvider: (providerId?: WalletProviderId) => Promise<void>;
  disconnectProvider: () => void;
  /** Get the underlying WalletProvider instance (e.g. for direct signing). */
  getActiveProvider: () => WalletProvider | null;
  // ── Legacy helpers (preserved for backward compat) ──
  freighter: WalletProviderState;
  connectFreighter: () => Promise<void>;
  disconnectFreighter: () => void;
  sendPayment: (input: SendPaymentInput) => Promise<SubmittedPayment>;

  // Helpers
  getWalletById: (id: string) => Wallet | undefined;
  getWalletByAddress: (address: string) => Wallet | undefined;
  formatAddress: (address: string, start?: number, end?: number) => string;
  getTotalBalance: () => { xlm: string; usdc: string; eurc: string };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Provides combined wallet management and Freighter extension integration.
 * Wraps the WalletContext for multi-wallet CRUD and adds Freighter connect/disconnect,
 * address formatting, and cross-wallet balance aggregation.
 * @returns A UseWalletReturn object with wallet state, Freighter state, and helper functions.
 */
export function useWallet(): UseWalletReturn {
  const context = useWalletContext();
  const {
    wallets,
    selectedWallet,
    isLoading,
    error,
    addWallet,
    removeWallet,
    selectWallet,
    updateWalletBalance,
    updateWalletName,
    setDefaultWallet,
    refreshBalances,
    walletProvider,
    connectWalletProvider,
    disconnectWalletProvider,
  } = context;
  const providerState: WalletProviderState = walletProvider;

  // ── Generic connect (delegates to the shared context) ────────────────────

  const connectProvider = useCallback(
    (providerId?: WalletProviderId) => connectWalletProvider(providerId),
    [connectWalletProvider],
  );

  const disconnectProvider = useCallback(
    () => disconnectWalletProvider(),
    [disconnectWalletProvider],
  );

  const getActiveProvider = useCallback((): WalletProvider | null => {
    if (!providerState.isConnected || !providerState.providerId) return null;
    try {
      return getProvider(providerState.providerId);
    } catch {
      return null;
    }
  }, [providerState.isConnected, providerState.providerId]);

  // ── sendPayment: delegates to submitPaymentTransaction ─────────────────

  const sendPayment = useCallback(
    async (input: SendPaymentInput): Promise<SubmittedPayment> => {
      const source = providerState.publicKey;
      if (!source) {
        throw new Error("Connect a wallet before sending a payment.");
      }
      return submitPaymentTransaction({
        source,
        destination: input.destination,
        amount: input.amount,
        asset: input.asset,
        memo: input.memo,
        assetIssuers: input.assetIssuers,
        onStatus: input.onStatus,
        onSubmitted: input.onSubmitted,
      });
    },
    [providerState.publicKey],
  );

  // ── Legacy Freighter helpers (delegate to the shared context) ─────────────

  const connectFreighter = useCallback(
    () => connectWalletProvider("freighter"),
    [connectWalletProvider],
  );

  const disconnectFreighter = useCallback(
    () => disconnectWalletProvider(),
    [disconnectWalletProvider],
  );

  const getWalletById = useCallback(
    (id: string) => wallets.find((w) => w.id === id),
    [wallets]
  );

  const getWalletByAddress = useCallback(
    (address: string) =>
      wallets.find(
        (w) => w.address.toLowerCase() === address.toLowerCase()
      ),
    [wallets]
  );

  const formatAddress = useCallback(
    (address: string, start = 4, end = 4): string => {
      if (address.length <= start + end) return address;
      return `${address.slice(0, start)}...${address.slice(-end)}`;
    },
    []
  );

  const getTotalBalance = useCallback(() => {
    return wallets.reduce(
      (acc, w) => ({
        xlm: (parseFloat(acc.xlm) + (parseFloat(w.balance.xlm) || 0)).toFixed(2),
        usdc: (parseFloat(acc.usdc) + (parseFloat(w.balance.usdc || "0") || 0)).toFixed(2),
        eurc: (parseFloat(acc.eurc) + (parseFloat(w.balance.eurc || "0") || 0)).toFixed(2),
      }),
      { xlm: "0.00", usdc: "0.00", eurc: "0.00" }
    );
  }, [wallets]);

  return {
    wallets,
    selectedWallet,
    isLoading,
    error,
    addWallet,
    removeWallet,
    selectWallet,
    updateWalletBalance,
    updateWalletName,
    setDefaultWallet,
    refreshBalances,
    // New generic provider state
    walletProvider: providerState,
    connectProvider,
    disconnectProvider,
    getActiveProvider,
    // Legacy aliases
    freighter: providerState,
    connectFreighter,
    disconnectFreighter,
    sendPayment,
    getWalletById,
    getWalletByAddress,
    formatAddress,
    getTotalBalance,
  };
}

export default useWallet;