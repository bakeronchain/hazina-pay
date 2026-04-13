"use client";

/**
 * /earn — Yield Discovery Dashboard
 *
 * Integrates two LI.FI APIs:
 *   1. Earn Data API  — vault discovery, APY, TVL (via /api/earn-vaults)
 *   2. Composer API   — deposit quote & execution (via /api/earn-quote)
 *
 * Features:
 *   - Browse 20+ protocols across 21 chains sorted by APY
 *   - Filter by token, chain, minimum APY
 *   - AI agent: type in plain English, get personalised vault recommendation
 *   - One-click deposit quote via Composer
 */

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { GoldButton } from "@/components/GoldButton";
import { formatAPY, formatTVL, getChainName, getChainColor, LiFiVault, bestAPY } from "@/lib/lifi";
import { formatDuration, formatGasUSD, ComposerQuote } from "@/lib/composer";

// ─── Chain options shown in the filter bar ─────────────────────────────────

const CHAIN_OPTIONS = [
  { id: 0, label: "All Chains" },
  { id: 42161, label: "Arbitrum" },
  { id: 8453, label: "Base" },
  { id: 10, label: "Optimism" },
  { id: 1, label: "Ethereum" },
  { id: 137, label: "Polygon" },
];

const TOKEN_OPTIONS = ["All", "USDC", "USDT", "DAI", "ETH", "WBTC", "WETH"];

// ─── VaultCard ──────────────────────────────────────────────────────────────

function VaultCard({
  vault,
  onDeposit,
}: {
  vault: LiFiVault;
  onDeposit: (vault: LiFiVault) => void;
}) {
  const apy = bestAPY(vault);
  const apyStr = formatAPY(apy);
  const tvlStr = formatTVL(vault.analytics.tvl.usd);
  const tokens = vault.underlyingTokens.map((t) => t.symbol).join(" + ");
  const chainColor = getChainColor(vault.chainId);
  const chainName = getChainName(vault.chainId);

  // APY colour coding
  const apyColor =
    apy >= 0.15
      ? "text-red-400" // >15% = high risk
      : apy >= 0.08
      ? "text-emerald-400" // 8-15% = great
      : apy >= 0.04
      ? "text-yellow-400" // 4-8% = good
      : "text-zinc-400"; // <4% = low

  return (
    <div className="group rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 transition-all hover:border-zinc-600 hover:bg-zinc-900/70">
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{vault.name}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{vault.protocol.name}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${chainColor}`}
        >
          {chainName}
        </span>
      </div>

      {/* Token */}
      <p className="mb-3 text-xs text-zinc-400">
        <span className="font-mono text-zinc-300">{tokens || "—"}</span>
      </p>

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-zinc-500">APY (7d)</p>
          <p className={`text-lg font-bold ${apyColor}`}>{apyStr}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">TVL</p>
          <p className="text-lg font-bold text-white">{tvlStr}</p>
        </div>
      </div>

      {/* Deposit button */}
      <button
        onClick={() => onDeposit(vault)}
        className="w-full rounded-xl border border-yellow-500/40 bg-yellow-500/10 py-2 text-sm font-medium text-yellow-400 transition-colors hover:bg-yellow-500/20 active:bg-yellow-500/30"
      >
        Deposit →
      </button>
    </div>
  );
}

// ─── DepositModal ───────────────────────────────────────────────────────────

function DepositModal({
  vault,
  onClose,
}: {
  vault: LiFiVault;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [fromChain, setFromChain] = useState(String(vault.chainId));
  const [fromToken, setFromToken] = useState(
    vault.underlyingTokens[0]?.symbol ?? "USDC"
  );
  const [walletAddress, setWalletAddress] = useState("");
  const [quote, setQuote] = useState<ComposerQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSent, setTxSent] = useState(false);

  const tokens = vault.underlyingTokens.map((t) => t.symbol);
  const decimals = vault.underlyingTokens[0]?.decimals ?? 18;

  async function getQuote() {
    if (!amount || !walletAddress || !walletAddress.startsWith("0x")) {
      setError("Enter an amount and a valid EVM wallet address (0x...)");
      return;
    }
    setLoading(true);
    setError(null);
    setQuote(null);

    try {
      const amountInUnits = BigInt(
        Math.round(parseFloat(amount) * 10 ** decimals)
      ).toString();

      const params = new URLSearchParams({
        fromChain,
        toChain: String(vault.chainId),
        fromToken,
        toToken: vault.address, // vault address — NOT underlying token
        fromAddress: walletAddress,
        toAddress: walletAddress,
        fromAmount: amountInUnits,
      });

      const res = await fetch(`/api/earn-quote?${params}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Quote failed");
      setQuote(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get quote");
    } finally {
      setLoading(false);
    }
  }

  async function executeDeposit() {
    if (!quote?.transactionRequest) return;
    const tx = quote.transactionRequest;

    try {
      if (!window.ethereum) {
        setError("No EVM wallet found. Install MetaMask or Rabby.");
        return;
      }

      // Switch to correct chain
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x" + tx.chainId.toString(16) }],
      });

      // Send transaction
      const txHash = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: tx.from,
            to: tx.to,
            data: tx.data,
            value: tx.value,
            gas: tx.gasLimit,
          },
        ],
      });

      setTxSent(true);
      console.log("Transaction sent:", txHash);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">{vault.name}</h2>
            <p className="text-sm text-zinc-400">
              {vault.protocol.name} · {getChainName(vault.chainId)} ·{" "}
              <span className="text-yellow-400 font-medium">
                {formatAPY(bestAPY(vault))} APY
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        {txSent ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
            <p className="text-2xl mb-2">✓</p>
            <p className="font-semibold text-emerald-400">Transaction submitted!</p>
            <p className="mt-1 text-sm text-zinc-400">
              Your deposit is being processed on-chain.
            </p>
            <button
              onClick={onClose}
              className="mt-4 rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Wallet address */}
            <div className="mb-3">
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Your EVM Wallet Address
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 font-mono text-sm text-white placeholder-zinc-600 focus:border-yellow-500/50 focus:outline-none"
              />
            </div>

            {/* Amount + token */}
            <div className="mb-3 flex gap-2">
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Amount
                </label>
                <input
                  type="number"
                  placeholder="100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-yellow-500/50 focus:outline-none"
                />
              </div>
              <div className="w-28">
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                  Token
                </label>
                <select
                  value={fromToken}
                  onChange={(e) => setFromToken(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white focus:border-yellow-500/50 focus:outline-none"
                >
                  {tokens.length > 0
                    ? tokens.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))
                    : TOKEN_OPTIONS.filter((t) => t !== "All").map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                </select>
              </div>
            </div>

            {/* From chain */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                From Chain
              </label>
              <select
                value={fromChain}
                onChange={(e) => setFromChain(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white focus:border-yellow-500/50 focus:outline-none"
              >
                {CHAIN_OPTIONS.filter((c) => c.id !== 0).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Quote result */}
            {quote && (
              <div className="mb-4 rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-sm">
                <p className="mb-2 font-medium text-white">Quote Summary</p>
                <div className="space-y-1 text-zinc-400">
                  <div className="flex justify-between">
                    <span>You deposit</span>
                    <span className="text-white">
                      {amount} {fromToken}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Estimated gas</span>
                    <span className="text-white">
                      {formatGasUSD(quote.estimate?.gasCosts ?? [])}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Execution time</span>
                    <span className="text-white">
                      {formatDuration(quote.estimate?.executionDuration ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Route</span>
                    <span className="text-white">{quote.toolDetails?.name ?? quote.tool}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              {!quote ? (
                <GoldButton
                  onClick={getQuote}
                  className="flex-1"
                  disabled={loading}
                >
                  {loading ? "Getting quote…" : "Get Quote"}
                </GoldButton>
              ) : (
                <GoldButton onClick={executeDeposit} className="flex-1">
                  Execute Deposit
                </GoldButton>
              )}
              {quote && (
                <button
                  onClick={() => setQuote(null)}
                  className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
                >
                  Reset
                </button>
              )}
            </div>

            <p className="mt-3 text-center text-xs text-zinc-600">
              Powered by LI.FI Composer · Vault:{" "}
              <span className="font-mono">{vault.address.slice(0, 10)}…</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── AIChat ─────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

function AIChat({
  onVaultSuggested,
}: {
  onVaultSuggested?: (vault: LiFiVault) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: 'Ask me anything about yield! Try: "Safest USDC vault above 5% on Arbitrum" or "Highest yield stablecoin vault under $10 gas"',
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/earn-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.message ?? "No recommendation found." },
      ]);

      // If the agent returned a recommended vault, bubble it up
      if (data.recommendedVault && onVaultSuggested) {
        // Reconstruct minimal LiFiVault from summary for modal
        const v = data.recommendedVault;
        const syntheticVault: LiFiVault = {
          address: v.address,
          name: v.name,
          network: v.chain,
          chainId: v.chainId,
          slug: v.address,
          protocol: { name: v.protocol, url: "" },
          underlyingTokens: v.tokens
            .split(", ")
            .map((s: string) => ({ address: "", symbol: s, decimals: 6 })),
          lpTokens: [],
          tags: [],
          analytics: {
            apy: { base: v.apyRaw ?? 0, reward: 0, total: v.apyRaw ?? 0 },
            apy1d: v.apyRaw ?? 0,
            apy7d: v.apyRaw ?? 0,
            apy30d: v.apyRaw ?? 0,
            tvl: { usd: v.tvlRaw ?? "0" },
            updatedAt: new Date().toISOString(),
          },
          provider: v.protocol,
          syncedAt: new Date().toISOString(),
          isTransactional: true,
          isRedeemable: true,
          depositPacks: [],
          redeemPacks: [],
        };
        onVaultSuggested(syntheticVault);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Sorry, I couldn't reach the yield advisor. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900/50">
      <div className="border-b border-zinc-800 px-4 py-3">
        <p className="text-sm font-semibold text-white">AI Yield Advisor</p>
        <p className="text-xs text-zinc-500">Powered by Claude + LI.FI Earn</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 p-4" style={{ minHeight: 200, maxHeight: 320 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-yellow-500/20 text-yellow-100"
                  : "bg-zinc-800 text-zinc-200"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-zinc-800 px-3 py-2 text-sm text-zinc-400">
              Analysing vaults…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder='e.g. "5% APY USDC on Arbitrum, low risk"'
          className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-yellow-500/50 focus:outline-none"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="rounded-xl bg-yellow-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-yellow-400 disabled:opacity-40"
        >
          Ask
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

interface VaultListResponse {
  vaults: LiFiVault[];
  total: number;
  fetchedAt: string;
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

export default function EarnPage() {
  const [vaults, setVaults] = useState<LiFiVault[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  // Filters
  const [selectedChain, setSelectedChain] = useState(0);
  const [selectedToken, setSelectedToken] = useState("All");
  const [minApy, setMinApy] = useState("");
  const [search, setSearch] = useState("");

  // Deposit modal
  const [depositVault, setDepositVault] = useState<LiFiVault | null>(null);

  const fetchVaultList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "80" });
      if (selectedChain) params.set("chains", String(selectedChain));
      if (selectedToken !== "All") params.set("tokens", selectedToken);
      if (minApy) params.set("minApy", minApy);
      if (search) params.set("search", search);

      const res = await fetch(`/api/earn-vaults?${params}`);
      if (!res.ok) throw new Error("Failed to fetch vaults");
      const data: VaultListResponse = await res.json();
      setVaults(data.vaults);
      setFetchedAt(data.fetchedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [selectedChain, selectedToken, minApy, search]);

  useEffect(() => {
    fetchVaultList();
  }, [fetchVaultList]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Home
          </Link>
          <span className="text-zinc-700">/</span>
          <span className="text-sm text-zinc-400">Earn</span>
        </div>
        <h1 className="text-4xl font-bold text-white">
          Earn Yield{" "}
          <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
            Everywhere
          </span>
        </h1>
        <p className="mt-2 text-zinc-400">
          Compare APY across 20+ protocols on 21 chains. Deposit in one click via LI.FI.
        </p>
      </div>

      {/* Two-column layout: filters + vaults | AI chat */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Left: filters + vault grid (2/3) ── */}
        <div className="lg:col-span-2">
          {/* Filter bar */}
          <div className="mb-5 flex flex-wrap gap-3">
            {/* Chain selector */}
            <select
              value={selectedChain}
              onChange={(e) => setSelectedChain(Number(e.target.value))}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-yellow-500/50 focus:outline-none"
            >
              {CHAIN_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>

            {/* Token selector */}
            <select
              value={selectedToken}
              onChange={(e) => setSelectedToken(e.target.value)}
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-yellow-500/50 focus:outline-none"
            >
              {TOKEN_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {/* Min APY */}
            <div className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3">
              <span className="text-xs text-zinc-500">Min APY</span>
              <input
                type="number"
                placeholder="0"
                value={minApy}
                onChange={(e) => setMinApy(e.target.value)}
                className="w-14 bg-transparent py-2 text-sm text-white placeholder-zinc-600 focus:outline-none"
              />
              <span className="text-xs text-zinc-500">%</span>
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search protocol, token…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-yellow-500/50 focus:outline-none"
            />
          </div>

          {/* Stats bar */}
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-zinc-500">
              {loading
                ? "Loading vaults…"
                : `${vaults.length} vaults · sorted by APY`}
            </p>
            {fetchedAt && (
              <p className="text-xs text-zinc-600">
                via LI.FI Earn API · {new Date(fetchedAt).toLocaleTimeString()}
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-44 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/40"
                />
              ))}
            </div>
          )}

          {/* Vault grid */}
          {!loading && vaults.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {vaults.map((v) => (
                <VaultCard key={v.address + v.chainId} vault={v} onDeposit={setDepositVault} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && vaults.length === 0 && !error && (
            <div className="rounded-2xl border border-dashed border-zinc-700 p-10 text-center">
              <p className="text-zinc-400">No vaults match your filters.</p>
              <p className="mt-1 text-sm text-zinc-600">
                Try removing some filters or lowering the min APY.
              </p>
            </div>
          )}
        </div>

        {/* ── Right: AI chat (1/3) ── */}
        <div className="lg:col-span-1">
          <AIChat onVaultSuggested={setDepositVault} />

          {/* Info card */}
          <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-xs text-zinc-500 space-y-2">
            <p className="font-medium text-zinc-400">How it works</p>
            <p>
              1. Browse vaults from 20+ DeFi protocols aggregated by LI.FI's Earn API.
            </p>
            <p>
              2. Ask the AI advisor to filter by token, chain, risk, or APY target.
            </p>
            <p>
              3. Click Deposit — LI.FI's Composer handles any swaps or bridges needed to deposit in one transaction.
            </p>
            <p className="pt-1 text-zinc-600">
              Data: LI.FI Earn API · Execution: LI.FI Composer
            </p>
          </div>
        </div>
      </div>

      {/* Deposit modal */}
      {depositVault && (
        <DepositModal vault={depositVault} onClose={() => setDepositVault(null)} />
      )}
    </main>
  );
}
