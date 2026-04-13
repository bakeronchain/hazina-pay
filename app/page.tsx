"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GoldButton } from "@/components/GoldButton";
import { isFreighterInstalled, connectFreighter, getFreighterAddress } from "@/lib/stellar";

export default function LandingPage() {
  const [address, setAddress] = useState<string | null>(null);
  const [freighterInstalled, setFreighterInstalled] = useState<boolean | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    isFreighterInstalled().then(setFreighterInstalled);
    getFreighterAddress().then((a) => { if (a) setAddress(a); });
  }, []);

  async function connect() {
    const addr = await connectFreighter();
    if (addr) setAddress(addr);
  }

  const isSignedIn = mounted && !!address;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      {/* Hero */}
      <div className="max-w-2xl">
        <div className="mb-4 inline-block rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1 text-sm text-blue-300">
          Built on Stellar · Powered by Soroban
        </div>

        <h1 className="mb-4 text-5xl font-bold tracking-tight text-white md:text-6xl">
          Hazina
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-500">
            Vault
          </span>
        </h1>

        <p className="mb-8 text-lg text-zinc-400">
          Forced savings for gig workers across Africa. Lock USDC on Stellar,
          earn yield, and access funds in a genuine emergency — reviewed by AI.
        </p>

        {isSignedIn ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-zinc-400">
              Connected:{" "}
              <span className="font-mono text-yellow-400">
                {address?.slice(0, 8)}…{address?.slice(-6)}
              </span>
            </p>
            <Link href="/stellar-vault">
              <GoldButton className="text-base px-8 py-4">Open Vault</GoldButton>
            </Link>
          </div>
        ) : freighterInstalled === false ? (
          <div className="flex flex-col items-center gap-3">
            <a href="https://www.freighter.app/" target="_blank" rel="noopener noreferrer">
              <GoldButton className="text-base px-8 py-4">Install Freighter →</GoldButton>
            </a>
            <p className="text-xs text-zinc-600">Freighter wallet required</p>
          </div>
        ) : (
          <GoldButton onClick={connect} className="text-base px-8 py-4">
            Connect Freighter
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
    </main>
  );
}
