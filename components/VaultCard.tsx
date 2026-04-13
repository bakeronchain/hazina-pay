"use client";

import { ProgressBar } from "./ProgressBar";
import { StatusBadge } from "./StatusBadge";
import { blocksToApproxDays, lockProgress } from "@/lib/hooks";

interface Props {
  balance: bigint;
  pendingYield: bigint;
  depositBlock: bigint;
  unlockBlock: bigint;
  currentBlock: bigint;
  verified: boolean;
  emergencyCount: number;
  decimals?: number; // token decimal places, default 6 (USDA)
}

function fmt(amount: bigint, decimals = 6): string {
  if (amount === BigInt(0)) return "0.00";
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 2);
  return `${whole.toLocaleString()}.${fracStr}`;
}

export function VaultCard({
  balance,
  pendingYield,
  depositBlock,
  unlockBlock,
  currentBlock,
  verified,
  emergencyCount,
  decimals = 6,
}: Props) {
  const isLocked = currentBlock < unlockBlock;
  const daysLeft = isLocked
    ? blocksToApproxDays(unlockBlock - currentBlock)
    : 0;
  const progress = lockProgress(depositBlock, unlockBlock, currentBlock);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">My Vault</h3>
        <div className="flex gap-2">
          <StatusBadge status={verified ? "verified" : "unverified"} />
          <StatusBadge status={isLocked ? "locked" : "unlocked"} />
        </div>
      </div>

      {/* Balances */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-zinc-800/60 p-4">
          <p className="text-xs text-zinc-400">Locked Balance</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {fmt(balance, decimals)}
          </p>
          <p className="text-xs text-zinc-500">USDA</p>
        </div>
        <div className="rounded-xl bg-zinc-800/60 p-4">
          <p className="text-xs text-zinc-400">Accrued Yield</p>
          <p className="mt-1 text-2xl font-bold text-yellow-400">
            +{fmt(pendingYield, decimals)}
          </p>
          <p className="text-xs text-zinc-500">USDA</p>
        </div>
      </div>

      {/* Lock progress */}
      {unlockBlock > BigInt(0) && (
        <div className="mb-4">
          <ProgressBar
            percent={progress}
            label={
              isLocked
                ? `~${daysLeft.toFixed(0)} days remaining`
                : "Lock period complete"
            }
          />
        </div>
      )}

      {/* Emergency count */}
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>Emergency withdrawals used</span>
        <span className={emergencyCount >= 3 ? "text-red-400" : "text-zinc-300"}>
          {emergencyCount} / 3
        </span>
      </div>
    </div>
  );
}
