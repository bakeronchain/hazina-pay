"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { VaultCard } from "@/components/VaultCard";
import { GoldButton } from "@/components/GoldButton";
import { useVaultData, useBurnBlockHeight, useUserAddress } from "@/lib/hooks";

function parseVaultResponse(raw: { result?: string }) {
  if (!raw?.result || raw.result === "0x09") return null;
  // TODO: replace with proper deserializeCV once you have real API shapes
  return {
    balance: BigInt(0),
    unlockBlock: BigInt(0),
    depositBlock: BigInt(0),
    verified: false,
    emergencyCount: 0,
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const address = useUserAddress();

  useEffect(() => {
    if (address === null) router.push("/");
  }, [address, router]);

  const { data, isLoading } = useVaultData(address);
  const { data: burnBlock = BigInt(0) } = useBurnBlockHeight();

  const vault = data ? parseVaultResponse(data.raw) : null;

  if (!address) return null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="font-mono text-sm text-zinc-400">
          {address.slice(0, 8)}…{address.slice(-6)}
        </p>
      </div>

      {isLoading && (
        <div className="flex h-48 items-center justify-center text-zinc-400">
          Loading vault…
        </div>
      )}

      {!isLoading && !vault && (
        <div className="rounded-2xl border border-dashed border-zinc-700 p-10 text-center">
          <p className="mb-2 text-zinc-400">You don't have a vault yet.</p>
          <p className="mb-6 text-sm text-zinc-500">
            First verify your identity, then create a vault.
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/verify">
              <GoldButton variant="outline">Verify Identity</GoldButton>
            </Link>
            <Link href="/create-vault">
              <GoldButton>Create Vault</GoldButton>
            </Link>
          </div>
        </div>
      )}

      {!isLoading && vault && (
        <>
          <VaultCard
            balance={vault.balance}
            pendingYield={data?.pendingYield ?? BigInt(0)}
            depositBlock={vault.depositBlock}
            unlockBlock={vault.unlockBlock}
            currentBlock={burnBlock}
            verified={vault.verified}
            emergencyCount={vault.emergencyCount}
          />

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link href="/create-vault">
              <GoldButton className="w-full">Deposit</GoldButton>
            </Link>
            <Link href="/withdraw">
              <GoldButton variant="outline" className="w-full">Withdraw</GoldButton>
            </Link>
            <Link href="/emergency">
              <GoldButton
                variant="outline"
                className="w-full text-orange-400 border-orange-500/50 hover:bg-orange-500/10"
              >
                Emergency
              </GoldButton>
            </Link>
            <Link href="/group">
              <GoldButton variant="outline" className="w-full">Group Vault</GoldButton>
            </Link>
          </div>

          {/* Earn CTA */}
          <div className="mt-4 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-yellow-300">Explore DeFi Yields</p>
              <p className="text-xs text-zinc-500">Compare 20+ protocols via LI.FI</p>
            </div>
            <Link href="/earn">
              <GoldButton className="text-sm py-1.5 px-3">Explore →</GoldButton>
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
