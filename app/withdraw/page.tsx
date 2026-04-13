"use client";

import { useRouter } from "next/navigation";
import { GoldButton } from "@/components/GoldButton";
import { useWithdraw, useVaultData, useBurnBlockHeight, useUserAddress } from "@/lib/hooks";
import { explorerTxUrl } from "@/lib/stacks";
import { useState } from "react";

export default function WithdrawPage() {
  const router = useRouter();
  const address = useUserAddress();
  const { data } = useVaultData(address);
  const { data: burnBlock = BigInt(0) } = useBurnBlockHeight();
  const { mutateAsync: withdraw, isPending, error } = useWithdraw();
  const [txId, setTxId] = useState<string | null>(null);

  // Very rough: parse unlock block from the raw CV response.
  // Replace with proper deserializeCV in production.
  const unlockBlock = BigInt(0); // TODO: parse from data?.raw
  const isUnlocked = burnBlock >= unlockBlock && unlockBlock > BigInt(0);

  async function handleWithdraw() {
    try {
      const { txId: id } = await withdraw();
      setTxId(id);
    } catch (e) {
      console.error(e);
    }
  }

  if (txId) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-8">
          <p className="mb-2 text-xl font-semibold text-green-400">Withdrawal Submitted!</p>
          <a
            href={explorerTxUrl(txId)}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-6 block font-mono text-xs text-yellow-400 underline"
          >
            View on Explorer ↗
          </a>
          <GoldButton onClick={() => router.push("/dashboard")}>
            Back to Dashboard
          </GoldButton>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold text-white">Withdraw</h1>
      <p className="mb-8 text-zinc-400">
        Normal withdrawals return your full principal plus accrued yield
        once the lock period has expired.
      </p>

      <div className="mb-8 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        {!isUnlocked ? (
          <>
            <p className="mb-2 font-semibold text-red-400">Vault is still locked</p>
            <p className="text-sm text-zinc-400">
              Your funds are locked until block {unlockBlock.toString()}. Current
              burn-block: {burnBlock.toString()}.
            </p>
            <p className="mt-4 text-sm text-zinc-400">
              Need funds urgently?{" "}
              <a href="/emergency" className="text-yellow-400 underline">
                Request an emergency withdrawal.
              </a>
            </p>
          </>
        ) : (
          <>
            <p className="mb-4 text-green-400 font-semibold">
              Your vault is unlocked and ready to withdraw.
            </p>
            <p className="mb-6 text-sm text-zinc-400">
              You will receive your principal + all accrued yield in a single
              transaction.
            </p>

            {error && (
              <p className="mb-4 text-sm text-red-400">{(error as Error).message}</p>
            )}

            <GoldButton
              onClick={handleWithdraw}
              loading={isPending}
              className="w-full"
            >
              Withdraw All
            </GoldButton>
          </>
        )}
      </div>

      <button
        onClick={() => router.back()}
        className="text-sm text-zinc-500 hover:text-zinc-300"
      >
        ← Back
      </button>
    </main>
  );
}
