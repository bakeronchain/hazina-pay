"use client";

/**
 * /stellar-vault — HazinaVault on Stellar
 *
 * Mirrors the Stacks vault experience but runs on Stellar/Soroban.
 * Uses the Freighter browser extension for signing.
 *
 * Contract: contracts/stellar/src/lib.rs
 * Lib:      lib/stellar.ts
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { GoldButton } from "@/components/GoldButton";
import {
  isFreighterInstalled,
  connectFreighter,
  getFreighterAddress,
  getStellarVault,
  getStellarPendingYield,
  stellarDeposit,
  stellarWithdraw,
  stellarEmergencyWithdraw,
  stroopsToUsdc,
  ledgerToDate,
  STELLAR_NETWORK,
  type StellarVaultData,
} from "@/lib/stellar";

// ─── Status badge ─────────────────────────────────────────────────────────────

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {children}
    </span>
  );
}

// ─── VaultInfo card ────────────────────────────────────────────────────────────

function VaultCard({
  vault,
  pendingYield,
  currentLedger,
}: {
  vault: StellarVaultData;
  pendingYield: bigint;
  currentLedger: number;
}) {
  const isLocked = vault.unlockLedger > currentLedger;
  const unlockDate = ledgerToDate(vault.unlockLedger, currentLedger);
  const progress = currentLedger >= vault.unlockLedger
    ? 100
    : Math.round(
        ((currentLedger - vault.depositLedger) /
          (vault.unlockLedger - vault.depositLedger)) *
          100
      );

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Stellar Vault</h2>
        <Badge color={isLocked ? "bg-blue-500/20 text-blue-400" : "bg-emerald-500/20 text-emerald-400"}>
          {isLocked ? "Locked" : "Unlocked"}
        </Badge>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-zinc-500">Balance</p>
          <p className="text-2xl font-bold text-white">{stroopsToUsdc(vault.balance)}</p>
          <p className="text-xs text-zinc-500">USDC</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Pending Yield</p>
          <p className="text-2xl font-bold text-yellow-400">+{stroopsToUsdc(pendingYield)}</p>
          <p className="text-xs text-zinc-500">USDC</p>
        </div>
      </div>

      {/* Lock progress */}
      <div className="mb-3">
        <div className="mb-1.5 flex justify-between text-xs text-zinc-500">
          <span>Lock progress</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-zinc-800">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-yellow-500 to-amber-400 transition-all"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>Unlock: {isLocked ? unlockDate.toLocaleDateString() : "Now"}</span>
        <span>Emergencies used: {vault.emergencyCount}/3</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "deposit" | "withdraw" | "emergency";

export default function StellarVaultPage() {
  const [address, setAddress] = useState<string | null>(null);
  const [freighterInstalled, setFreighterInstalled] = useState<boolean | null>(null);
  const [vault, setVault] = useState<StellarVaultData | null>(null);
  const [pendingYield, setPendingYield] = useState<bigint>(BigInt(0));
  const [currentLedger, setCurrentLedger] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("deposit");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Deposit form
  const [depositAmount, setDepositAmount] = useState("");
  const [lockMonths, setLockMonths] = useState(3);

  // Emergency form
  const [emergencyAmount, setEmergencyAmount] = useState("");
  const [emergencyReason, setEmergencyReason] = useState("");
  const [emergencyImage, setEmergencyImage] = useState<File | null>(null);
  const [aiReviewing, setAiReviewing] = useState(false);

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    isFreighterInstalled().then(setFreighterInstalled);
    getFreighterAddress().then((a) => {
      if (a) setAddress(a);
    });
  }, []);

  useEffect(() => {
    if (!address) return;
    refreshVault();
  }, [address]);

  async function refreshVault() {
    if (!address) return;
    setLoading(true);
    try {
      const [v, y] = await Promise.all([
        getStellarVault(address),
        getStellarPendingYield(address),
      ]);
      setVault(v);
      setPendingYield(y);
    } finally {
      setLoading(false);
    }
  }

  // ── Wallet ─────────────────────────────────────────────────────────────────

  async function connect() {
    const addr = await connectFreighter();
    if (addr) setAddress(addr);
    else setError("Freighter rejected the connection.");
  }

  function disconnect() {
    setAddress(null);
    setVault(null);
    setPendingYield(BigInt(0));
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleDeposit() {
    if (!address || !depositAmount) return;
    setError(null);
    setTxHash(null);
    setLoading(true);
    try {
      const hash = await stellarDeposit(address, depositAmount, lockMonths);
      setTxHash(hash);
      setDepositAmount("");
      await refreshVault();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw() {
    if (!address) return;
    setError(null);
    setTxHash(null);
    setLoading(true);
    try {
      const hash = await stellarWithdraw(address);
      setTxHash(hash);
      await refreshVault();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Withdrawal failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmergency() {
    if (!address || !emergencyAmount || !emergencyReason || !emergencyImage) return;
    setError(null);
    setTxHash(null);
    setAiReviewing(true);

    try {
      // 1. Submit to AI review (reuse existing endpoint)
      const form = new FormData();
      form.append("image", emergencyImage);
      form.append("description", emergencyReason);
      form.append("userAddress", address);
      form.append("amount", String(Math.round(parseFloat(emergencyAmount) * 1e7)));

      const reviewRes = await fetch("/api/review-emergency", {
        method: "POST",
        body: form,
      });
      const review = await reviewRes.json();

      if (!review.approved) {
        setError(`AI review rejected: ${review.message}`);
        return;
      }

      setAiReviewing(false);
      setLoading(true);

      // 2. Submit on-chain
      const hash = await stellarEmergencyWithdraw(
        address,
        emergencyAmount,
        emergencyReason,
        review.signature
      );
      setTxHash(hash);
      await refreshVault();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Emergency withdrawal failed");
    } finally {
      setAiReviewing(false);
      setLoading(false);
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const networkLabel =
    STELLAR_NETWORK === "mainnet" ? "Stellar Mainnet" : "Stellar Testnet";

  const explorerBase =
    STELLAR_NETWORK === "mainnet"
      ? "https://stellar.expert/explorer/public/tx"
      : "https://stellar.expert/explorer/testnet/tx";

  // ── Not installed ──────────────────────────────────────────────────────────

  if (freighterInstalled === false) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <div className="max-w-md">
          <h1 className="mb-4 text-3xl font-bold text-white">
            Freighter Required
          </h1>
          <p className="mb-6 text-zinc-400">
            Install the Freighter wallet extension to use the Stellar vault.
          </p>
          <a
            href="https://www.freighter.app/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <GoldButton>Install Freighter →</GoldButton>
          </a>
          <div className="mt-4">
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
              ← Back to home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ── Not connected ──────────────────────────────────────────────────────────

  if (!address) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <div className="max-w-md">
          <div className="mb-4 inline-block rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm text-blue-400">
            {networkLabel}
          </div>
          <h1 className="mb-2 text-4xl font-bold text-white">
            Hazina
            <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
              Vault
            </span>
          </h1>
          <p className="mb-2 text-lg font-medium text-zinc-300">on Stellar</p>
          <p className="mb-8 text-zinc-400">
            Lock USDC on Stellar. Earn yield. Access funds in emergencies — reviewed by Claude AI.
          </p>
          <GoldButton onClick={connect} className="text-base px-8 py-3">
            Connect Freighter
          </GoldButton>
          <div className="mt-4">
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
              ← Back (Stacks version)
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ── Connected ──────────────────────────────────────────────────────────────

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
              ← Home
            </Link>
            <span className="text-zinc-700">/</span>
            <span className="text-xs text-zinc-400">Stellar Vault</span>
          </div>
          <h1 className="text-2xl font-bold text-white">
            HazinaVault{" "}
            <span className="text-sm font-normal text-blue-400">Stellar</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-zinc-400">
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
          <button
            onClick={disconnect}
            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Vault card (if exists) */}
      {loading && !vault && (
        <div className="mb-6 h-48 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/40" />
      )}

      {vault && (
        <div className="mb-6">
          <VaultCard
            vault={vault}
            pendingYield={pendingYield}
            currentLedger={currentLedger}
          />
        </div>
      )}

      {!loading && !vault && (
        <div className="mb-6 rounded-2xl border border-dashed border-zinc-700 p-8 text-center">
          <p className="text-zinc-400">No Stellar vault yet.</p>
          <p className="mt-1 text-sm text-zinc-600">
            Deposit USDC below to create one.
          </p>
        </div>
      )}

      {/* Tab bar */}
      <div className="mb-5 flex rounded-xl border border-zinc-800 bg-zinc-900/50 p-1">
        {(["deposit", "withdraw", "emergency"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(null); setTxHash(null); }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "bg-zinc-800 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t === "emergency" ? "Emergency" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Deposit tab ── */}
      {tab === "deposit" && (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Amount (USDC)
            </label>
            <input
              type="number"
              placeholder="100"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-600 focus:border-yellow-500/50 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Lock duration: <span className="text-yellow-400">{lockMonths} month{lockMonths > 1 ? "s" : ""}</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {[1, 3, 6, 12].map((m) => (
                <button
                  key={m}
                  onClick={() => setLockMonths(m)}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                    lockMonths === m
                      ? "border-yellow-500/60 bg-yellow-500/20 text-yellow-400"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  {m}mo
                </button>
              ))}
            </div>
          </div>

          <GoldButton
            onClick={handleDeposit}
            disabled={loading || !depositAmount}
            className="w-full"
          >
            {loading ? "Depositing…" : "Deposit & Lock"}
          </GoldButton>

          <p className="text-xs text-zinc-600 text-center">
            6% APY · Powered by Stellar/Soroban · Signed by Freighter
          </p>
        </div>
      )}

      {/* ── Withdraw tab ── */}
      {tab === "withdraw" && (
        <div className="space-y-4">
          {vault && vault.unlockLedger > currentLedger ? (
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/40 p-4 text-sm text-zinc-400">
              <p className="font-medium text-white">Vault is locked</p>
              <p className="mt-1">
                Your funds unlock on{" "}
                {ledgerToDate(vault.unlockLedger, currentLedger).toLocaleDateString()}.
                Use Emergency if you have an urgent need.
              </p>
            </div>
          ) : (
            <>
              {vault && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
                  <p className="font-medium text-emerald-400">Ready to withdraw</p>
                  <p className="mt-1 text-zinc-400">
                    You will receive{" "}
                    <span className="text-white font-medium">
                      {stroopsToUsdc(vault.balance + pendingYield)} USDC
                    </span>{" "}
                    (principal + yield).
                  </p>
                </div>
              )}
              <GoldButton
                onClick={handleWithdraw}
                disabled={loading || !vault}
                className="w-full"
              >
                {loading ? "Withdrawing…" : "Withdraw All"}
              </GoldButton>
            </>
          )}
        </div>
      )}

      {/* ── Emergency tab ── */}
      {tab === "emergency" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 text-sm text-orange-300">
            AI reviews your evidence. If approved (≥75% confidence), funds are released immediately — yield is forfeited.
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Amount to withdraw (USDC)
            </label>
            <input
              type="number"
              placeholder="50"
              value={emergencyAmount}
              onChange={(e) => setEmergencyAmount(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-600 focus:border-yellow-500/50 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Describe your emergency
            </label>
            <textarea
              placeholder="e.g. Medical bill due tomorrow…"
              value={emergencyReason}
              onChange={(e) => setEmergencyReason(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-yellow-500/50 focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Upload evidence (photo)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setEmergencyImage(e.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-400 file:mr-4 file:rounded-lg file:border-0 file:bg-yellow-500/20 file:px-3 file:py-1 file:text-xs file:text-yellow-400"
            />
          </div>

          <button
            onClick={handleEmergency}
            disabled={loading || aiReviewing || !emergencyAmount || !emergencyReason || !emergencyImage}
            className="w-full rounded-xl bg-orange-500 py-3 font-semibold text-white transition-colors hover:bg-orange-400 disabled:opacity-40"
          >
            {aiReviewing
              ? "AI reviewing…"
              : loading
              ? "Processing…"
              : "Submit for AI Review"}
          </button>
        </div>
      )}

      {/* Feedback */}
      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {txHash && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm font-medium text-emerald-400">Transaction confirmed</p>
          <a
            href={`${explorerBase}/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block font-mono text-xs text-zinc-400 hover:text-zinc-200 break-all"
          >
            {txHash}
          </a>
        </div>
      )}

      {/* Link to Stacks version */}
      <div className="mt-8 text-center">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-300">
          Switch to Stacks vault →
        </Link>
      </div>
    </main>
  );
}
