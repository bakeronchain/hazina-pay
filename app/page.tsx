"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GoldButton } from "@/components/GoldButton";
import { connectWallet, disconnectWallet, isWalletConnected, getConnectedAddress } from "@/lib/wallet";
import { setUserAddress, useUserAddress } from "@/lib/hooks";

export default function LandingPage() {
  const userAddress = useUserAddress();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Sync wallet session on mount
  useEffect(() => {
    if (isWalletConnected()) {
      setUserAddress(getConnectedAddress());
    }
  }, []);

  function connect() {
    connectWallet(() => {
      setUserAddress(getConnectedAddress());
    });
  }

  function disconnect() {
    disconnectWallet();
    setUserAddress(null);
  }

  const isSignedIn = mounted && !!userAddress;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      {/* Hero */}
      <div className="max-w-2xl">
        <div className="mb-4 inline-block rounded-full border border-yellow-500/30 bg-yellow-500/10 px-4 py-1 text-sm text-yellow-400">
          Built on Stacks · Secured by Bitcoin
        </div>

        <h1 className="mb-4 text-5xl font-bold tracking-tight text-white md:text-6xl">
          Hazina
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-500">
            Vault
          </span>
        </h1>

        <p className="mb-8 text-lg text-zinc-400">
          Forced savings for gig workers across Africa. Lock stablecoins, earn
          yield, and access funds in a genuine emergency — reviewed by AI.
        </p>

        {isSignedIn ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-zinc-400">
              Connected:{" "}
              <span className="font-mono text-yellow-400">
                {userAddress?.slice(0, 8)}…{userAddress?.slice(-6)}
              </span>
            </p>
            <div className="flex gap-3">
              <Link href="/dashboard">
                <GoldButton>Go to Dashboard</GoldButton>
              </Link>
              <GoldButton variant="outline" onClick={disconnect}>
                Disconnect
              </GoldButton>
            </div>
          </div>
        ) : (
          <GoldButton onClick={connect} className="text-base px-8 py-4">
            Connect Wallet
          </GoldButton>
        )}
      </div>

      {/* Features */}
      <div className="mt-24 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
        {[
          {
            title: "Forced Savings",
            body: "Lock funds for 1–12 months. Remove the temptation to spend.",
          },
          {
            title: "Earn Yield",
            body: "6% APY default, funded by the protocol reserve and growing.",
          },
          {
            title: "AI Emergency Access",
            body: "Genuine emergencies reviewed by Claude AI in minutes, not days.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-left"
          >
            <h3 className="mb-2 font-semibold text-white">{f.title}</h3>
            <p className="text-sm text-zinc-400">{f.body}</p>
          </div>
        ))}
      </div>

      {/* Stellar vault link */}
      <div className="mt-6 max-w-2xl rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-blue-300">Also available on Stellar</p>
          <p className="text-xs text-zinc-500">Lock USDC on Stellar/Soroban · Freighter wallet</p>
        </div>
        <Link href="/stellar-vault">
          <GoldButton className="text-sm py-1.5 px-3">Open →</GoldButton>
        </Link>
      </div>

      {/* LI.FI Earn callout */}
      <div className="mt-12 max-w-2xl rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-6 text-left">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-yellow-400">
            New · Powered by LI.FI
          </span>
        </div>
        <h3 className="mb-2 text-lg font-bold text-white">
          Find the Best Yield — Anywhere
        </h3>
        <p className="mb-4 text-sm text-zinc-400">
          Browse 20+ DeFi protocols across 21 chains. Ask our AI agent in plain English and deposit in one click.
        </p>
        <Link href="/earn">
          <GoldButton>Explore Yield Opportunities →</GoldButton>
        </Link>
      </div>
    </main>
  );
}
