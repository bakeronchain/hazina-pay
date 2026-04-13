/**
 * LI.FI Earn Data API helpers (server-side)
 * No auth required — https://earn.li.fi
 */

const EARN_API = "https://earn.li.fi";

export interface LiFiVault {
  address: string;
  network: string;
  chainId: number;
  slug: string;
  name: string;
  protocol: { name: string; url: string };
  underlyingTokens: Array<{ address: string; symbol: string; decimals: number }>;
  analytics: {
    apy: { base: number; reward: number; total: number };
    apy7d: number | null;
    tvl: { usd: string };
    updatedAt: string;
  };
  isTransactional: boolean;
  isRedeemable: boolean;
}

export async function fetchVaults(params?: {
  tokens?: string[];
  limit?: number;
}): Promise<LiFiVault[]> {
  const url = new URL(`${EARN_API}/v1/earn/vaults`);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.tokens?.length) {
    params.tokens.forEach((t) => url.searchParams.append("asset", t));
  }

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Earn API ${res.status}`);
  const data = await res.json() as { data: LiFiVault[] };
  return data.data ?? [];
}

export function bestAPY(vault: LiFiVault): number {
  return vault.analytics.apy7d ?? vault.analytics.apy.total ?? 0;
}

export function formatAPY(apy: number | null): string {
  if (!apy) return "—";
  return `${(apy * 100).toFixed(2)}%`;
}

export function formatTVL(usd: string): string {
  const n = parseFloat(usd);
  if (isNaN(n)) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum", 10: "Optimism", 137: "Polygon",
  42161: "Arbitrum", 8453: "Base", 43114: "Avalanche",
  56: "BNB Chain",
};
export function getChainName(chainId: number): string {
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
}
