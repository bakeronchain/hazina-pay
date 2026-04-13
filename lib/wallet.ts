"use client";

/**
 * lib/wallet.ts
 * Centralised Stacks wallet session using @stacks/auth + @stacks/connect.
 * Import from here instead of touching @stacks/connect directly.
 */

import { AppConfig, UserSession } from "@stacks/auth";
import { showConnect, disconnect } from "@stacks/connect";

const appConfig = new AppConfig(["store_write", "publish_data"]);
export const userSession = new UserSession({ appConfig });

export function isWalletConnected(): boolean {
  if (typeof window === "undefined") return false;
  return userSession.isUserSignedIn();
}

export function getConnectedAddress(): string | null {
  if (!isWalletConnected()) return null;
  const data = userSession.loadUserData();
  const network = process.env.NEXT_PUBLIC_STACKS_NETWORK ?? "testnet";
  return network === "mainnet"
    ? data.profile.stxAddress.mainnet
    : data.profile.stxAddress.testnet;
}

export function connectWallet(onFinish: () => void) {
  showConnect({
    appDetails: {
      name: process.env.NEXT_PUBLIC_APP_NAME ?? "HazinaVault",
      icon:
        typeof window !== "undefined"
          ? `${window.location.origin}/icon.png`
          : "/icon.png",
    },
    userSession,
    onFinish,
    onCancel: () => {},
  });
}

export function disconnectWallet() {
  disconnect();
}
