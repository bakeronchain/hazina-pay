/**
 * lib/lifi.ts
 *
 * Client for the LI.FI Earn Data API (https://earn.li.fi)
 * No authentication required — free to call from client or server.
 *
 * API docs: https://docs.li.fi/earn/overview
 */

const EARN_API = "https://earn.li.fi";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface LiFiToken {
  address: string;
  symbol: string;
  decimals: number;
}

export interface LiFiProtocol {
  name: string;
  url: string;
}

export interface LiFiVaultAnalytics {
  apy: {
    base: number;
    reward: number;
    total: number;
  };
  apy1d: number;
  apy7d: number | null;
  apy30d: number;
  tvl: {
    usd: string; // string — parse with parseFloat
  };
  updatedAt: string;
}

export interface LiFiVault {
  address: string;
  network: string;
  chainId: number;
  slug: string;
  name: string;
  protocol: LiFiProtocol;
  underlyingTokens: LiFiToken[];
  lpTokens: unknown[];
  tags: string[];
  analytics: LiFiVaultAnalytics;
  provider: string;
  syncedAt: string;
  isTransactional: boolean;
  isRedeemable: boolean;
  depositPacks: Array<{ name: string; stepsType: string }>;
  redeemPacks: Array<{ name: string; stepsType: string }>;
}

export interface VaultListResponse {
  data: LiFiVault[];
  total?: number;
  nextCursor?: string;
}

// ─── Fetch helpers ──────────────────────────────────────────────────────────

/**
 * Fetch vaults from the Earn Data API.
 * Returns an empty array (never throws) so UI degrades gracefully.
 */
export async function fetchVaults(params?: {
  tokens?: string[]; // e.g. ["USDC", "USDT"]
  limit?: number;
  sortBy?: string;
}): Promise<LiFiVault[]> {
  try {
    const url = new URL(`${EARN_API}/v1/earn/vaults`);
    if (params?.limit) url.searchParams.set("limit", String(params.limit));
    if (params?.sortBy) url.searchParams.set("sortBy", params.sortBy);
    if (params?.tokens?.length) {
      params.tokens.forEach((t) => url.searchParams.append("asset", t));
    }

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 }, // Next.js cache — refresh every 60s
    });

    if (!res.ok) {
      console.error(`Earn API error: ${res.status} ${url}`);
      return [];
    }

    const data: VaultListResponse = await res.json();
    return data.data ?? [];
  } catch (err) {
    console.error("fetchVaults failed:", err);
    return [];
  }
}

/**
 * Fetch a single vault by its address.
 */
export async function fetchVaultByAddress(
  address: string
): Promise<LiFiVault | null> {
  try {
    const res = await fetch(`${EARN_API}/v1/earn/vaults/${address}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── Formatting utilities ───────────────────────────────────────────────────

/** Format decimal APY (0.07) as "7.00%" */
export function formatAPY(apy: number | null | undefined): string {
  if (apy === null || apy === undefined) return "—";
  return `${(apy * 100).toFixed(2)}%`;
}

/** Parse TVL string and format with B/M/K suffix */
export function formatTVL(usd: string | undefined): string {
  if (!usd) return "—";
  const n = parseFloat(usd);
  if (isNaN(n)) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

/** Human-readable chain name */
export function getChainName(chainId: number): string {
  const chains: Record<number, string> = {
    1: "Ethereum",
    10: "Optimism",
    137: "Polygon",
    42161: "Arbitrum",
    8453: "Base",
    43114: "Avalanche",
    56: "BNB Chain",
    250: "Fantom",
    100: "Gnosis",
    1101: "Polygon zkEVM",
    324: "zkSync Era",
    59144: "Linea",
    534352: "Scroll",
    34443: "Mode",
    81457: "Blast",
    5000: "Mantle",
    169: "Manta",
    252: "Fraxtal",
    7777777: "Zora",
  };
  return chains[chainId] ?? `Chain ${chainId}`;
}

/** Tailwind color classes for chain badge */
export function getChainColor(chainId: number): string {
  const colors: Record<number, string> = {
    1: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    10: "bg-red-500/20 text-red-400 border-red-500/30",
    137: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    42161: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    8453: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    43114: "bg-red-400/20 text-red-300 border-red-400/30",
    56: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };
  return (
    colors[chainId] ?? "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
  );
}

/** Best available APY from a vault (7d preferred, fallback to total) */
export function bestAPY(vault: LiFiVault): number {
  return vault.analytics.apy7d ?? vault.analytics.apy.total ?? 0;
}
