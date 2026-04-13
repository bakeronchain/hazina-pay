"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GoldButton } from "@/components/GoldButton";
import {
  useCreateVault,
  useJoinVault,
  useGroupDeposit,
  useGroupWithdraw,
  useUserAddress,
} from "@/lib/hooks";
import { explorerTxUrl } from "@/lib/stacks";

const LOCK_OPTIONS = [1, 3, 6, 9, 12];

function toMicro(amount: string, decimals = 6): bigint {
  const n = parseFloat(amount);
  if (isNaN(n) || n <= 0) return BigInt(0);
  return BigInt(Math.round(n * 10 ** decimals));
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace("0x", "");
  return Uint8Array.from(Buffer.from(clean, "hex"));
}

type Tab = "create" | "join" | "deposit" | "withdraw";

export default function GroupVaultPage() {
  const address = useUserAddress();
  const [tab, setTab] = useState<Tab>("create");
  const [lockMonths, setLockMonths] = useState(6);
  const [vaultIdInput, setVaultIdInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [txId, setTxId] = useState<string | null>(null);

  const createVault = useCreateVault();
  const joinVault = useJoinVault();
  const groupDeposit = useGroupDeposit();
  const groupWithdraw = useGroupWithdraw();

  const isPending =
    createVault.isPending ||
    joinVault.isPending ||
    groupDeposit.isPending ||
    groupWithdraw.isPending;

  async function handleCreate() {
    const { txId: id } = await createVault.mutateAsync({ lockMonths });
    setTxId(id);
  }

  async function handleJoin() {
    if (!vaultIdInput.trim()) return;
    const vaultId = hexToBytes(vaultIdInput.trim());
    const { txId: id } = await joinVault.mutateAsync({ vaultId });
    setTxId(id);
  }

  async function handleDeposit() {
    if (!vaultIdInput.trim()) return;
    const vaultId = hexToBytes(vaultIdInput.trim());
    const amount = toMicro(amountInput);
    const { txId: id } = await groupDeposit.mutateAsync({ vaultId, amount });
    setTxId(id);
  }

  async function handleWithdraw() {
    if (!vaultIdInput.trim()) return;
    const vaultId = hexToBytes(vaultIdInput.trim());
    const { txId: id } = await groupWithdraw.mutateAsync({ vaultId });
    setTxId(id);
  }

  if (txId) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-8">
          <p className="mb-2 text-xl font-semibold text-green-400">
            Transaction Submitted!
          </p>
          <a
            href={explorerTxUrl(txId)}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-6 block font-mono text-xs text-yellow-400 underline"
          >
            View on Explorer ↗
          </a>
          <GoldButton onClick={() => setTxId(null)}>Back</GoldButton>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold text-white">Group Vaults</h1>
      <p className="mb-6 text-zinc-400">
        Save together. Create a group vault and invite up to 20 members. Each
        member controls their own balance and unlock schedule.
      </p>

      {/* Tabs */}
      <div className="mb-8 flex rounded-xl border border-zinc-800 p-1">
        {(["create", "join", "deposit", "withdraw"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm capitalize transition-all ${
              tab === t
                ? "bg-yellow-500/10 text-yellow-400"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Create */}
      {tab === "create" && (
        <div className="space-y-5">
          <div>
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
          </div>
          <GoldButton
            onClick={handleCreate}
            loading={createVault.isPending}
            disabled={!address}
            className="w-full"
          >
            Create Group Vault
          </GoldButton>
          <p className="text-xs text-zinc-500">
            After creation, share the vault-id (from the tx result) with members
            so they can join.
          </p>
        </div>
      )}

      {/* Join / Deposit / Withdraw — all need a vault-id */}
      {(tab === "join" || tab === "deposit" || tab === "withdraw") && (
        <div className="space-y-5">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Vault ID (hex)</label>
            <input
              type="text"
              placeholder="0x1a2b3c…"
              value={vaultIdInput}
              onChange={(e) => setVaultIdInput(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 font-mono text-sm text-white placeholder-zinc-600 focus:border-yellow-500 focus:outline-none"
            />
          </div>

          {tab === "deposit" && (
            <div>
              <label className="mb-1 block text-sm text-zinc-300">Amount (USDA)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-600 focus:border-yellow-500 focus:outline-none"
              />
            </div>
          )}

          <GoldButton
            onClick={
              tab === "join"
                ? handleJoin
                : tab === "deposit"
                ? handleDeposit
                : handleWithdraw
            }
            loading={isPending}
            disabled={!address || !vaultIdInput.trim()}
            className="w-full"
          >
            {tab === "join"
              ? "Join Vault"
              : tab === "deposit"
              ? "Deposit"
              : "Withdraw"}
          </GoldButton>
        </div>
      )}
    </main>
  );
}
