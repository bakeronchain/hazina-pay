/**
 * GET /api/earn-vaults
 *
 * Server-side proxy to the LI.FI Earn Data API.
 * Fetches vaults, filters to transactional ones with valid APY,
 * sorts by 7d APY descending, and returns the top results.
 *
 * Query params (all optional):
 *   tokens  — comma-separated symbols e.g. "USDC,USDT"
 *   chains  — comma-separated chainIds e.g. "42161,8453"
 *   minApy  — minimum APY in percent e.g. "5"
 *   limit   — max results (default 50)
 *   search  — text search on name / protocol / token
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchVaults, bestAPY, LiFiVault } from "@/lib/lifi";

export const revalidate = 60; // ISR cache for 60 seconds

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const tokensParam = searchParams.get("tokens");
  const chainsParam = searchParams.get("chains");
  const minApyParam = searchParams.get("minApy");
  const limitParam = searchParams.get("limit");
  const search = searchParams.get("search")?.toLowerCase();

  const tokens = tokensParam ? tokensParam.split(",").map((t) => t.trim()) : undefined;
  const chainIds = chainsParam
    ? chainsParam.split(",").map((c) => parseInt(c.trim(), 10)).filter(Boolean)
    : undefined;
  const minApy = minApyParam ? parseFloat(minApyParam) / 100 : 0; // convert % to decimal
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 200) : 50;

  // Fetch from LI.FI Earn Data API (no auth needed)
  const allVaults = await fetchVaults({ tokens, limit: 500 });

  let vaults: LiFiVault[] = allVaults
    // Only include vaults that support direct deposits
    .filter((v) => v.isTransactional)
    // Must have a valid APY
    .filter((v) => bestAPY(v) > 0)
    // Chain filter
    .filter((v) => !chainIds?.length || chainIds.includes(v.chainId))
    // Min APY filter
    .filter((v) => bestAPY(v) >= minApy)
    // Text search
    .filter((v) => {
      if (!search) return true;
      return (
        v.name.toLowerCase().includes(search) ||
        v.protocol.name.toLowerCase().includes(search) ||
        v.underlyingTokens.some((t) => t.symbol.toLowerCase().includes(search)) ||
        v.network.toLowerCase().includes(search)
      );
    });

  // Sort by best APY descending
  vaults.sort((a, b) => bestAPY(b) - bestAPY(a));

  // Cap at requested limit
  vaults = vaults.slice(0, limit);

  return NextResponse.json({
    vaults,
    total: vaults.length,
    fetchedAt: new Date().toISOString(),
  });
}
