"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GoldButton } from "@/components/GoldButton";
import { useDeposit, useTokenBalance, useUserAddress } from "@/lib/hooks";
import { explorerTxUrl } from "@/lib/stacks";

const LOCK_OPTIONS = [1, 3, 6, 9, 12];

function toMicro(amount: string, decimals = 6): bigint {
  const n = parseFloat(amount);
  if (isNaN(n) || n <= 0) return BigInt(0);
  return BigInt(Math.round(n * 10 ** decimals));
}

function fromMicro(amount: bigint, decimals = 6): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const frac = (amount % divisor).toString().padStart(decimals, "0").slice(0, 2);
  return `${whole}.${frac}`;
}

export default function CreateVaultPage() {
  const router = useRouter();
  const address = useUserAddress();
  const { data: balance = BigInt(0) } = useTokenBalance(address);
  const { mutateAsync: deposit, isPending, error } = useDeposit();

  const [amountInput, setAmountInput] = useState("");
  const [lockMonths, setLockMonths] = useState(6);
  const [txId, setTxId] = useState<string | null>(null);

  const amount = toMicro(amountInput);
  const canDeposit = amount > BigInt(0) && amount <= balance && !isPending;

  async function handleDeposit() {
    if (!canDeposit) return;
    try {
      const { txId: id } = await deposit({ amount, lockMonths });
      setTxId(id);
    } catch (e) {
      console.error(e);
    }
  }

  if (txId) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-8">
          <p className="mb-2 text-xl font-semibold text-green-400">Deposit Submitted!</p>
          <p className="mb-4 text-sm text-zinc-400">
            Your funds are being locked on-chain.
          </p>
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
      <h1 className="mb-2 text-3xl font-bold text-white">Deposit & Lock</h1>
      <p className="mb-8 text-zinc-400">
        Choose how much to lock and for how long. Your balance earns 6% APY
        during the lock period.
      </p>

      {/* Balance */}
      <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <p className="text-xs text-zinc-400">Wallet Balance</p>
        <p className="text-xl font-bold text-white">{fromMicro(balance)} USDA</p>
      </div>

      {/* Amount input */}
      <div className="mb-5">
        <label className="mb-1 block text-sm text-zinc-300">Amount (USDA)</label>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-600 focus:border-yellow-500 focus:outline-none"
          />
          <button
            onClick={() => setAmountInput(fromMicro(balance))}
            className="rounded-xl border border-zinc-700 px-4 text-sm text-zinc-400 hover:border-yellow-500 hover:text-yellow-400"
          >
            Max
          </button>
        </div>
      </div>

      {/* Lock period */}
      <div className="mb-8">
        <label className="mb-2 block text-sm text-zinc-300">Lock Period</label>
        <div className="flex gap-2 flex-wrap">
          {LOCK_OPTIONS.map((m) => (
            <button
              key={m}
              onClick={() => setLockMonths(m)}
              className={`rounded-xl border px-4 py-2 text-sm transition-all ${
                lockMonths === m
                  ? "border-yellow-500 bg-yellow-500/10 text-yellow-400"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {m}m
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Funds unlock after {lockMonths} month{lockMonths > 1 ? "s" : ""}. Additional deposits extend
          (never shorten) the lock period.
        </p>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-400">{(error as Error).message}</p>
      )}

      <GoldButton
        onClick={handleDeposit}
        loading={isPending}
        disabled={!canDeposit}
        className="w-full"
      >
        Lock {amountInput || "0"} USDA for {lockMonths} months
      </GoldButton>
    </main>
  );
}
