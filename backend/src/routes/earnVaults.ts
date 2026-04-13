/**
 * GET /api/earn-vaults
 *
 * Proxy to LI.FI Earn Data API. Filters, sorts by APY, and returns results.
 *
 * Query params:
 *   tokens  — comma-separated e.g. "USDC,USDT"
 *   chains  — comma-separated chainIds e.g. "42161,8453"
 *   minApy  — minimum APY in percent e.g. "5"
 *   limit   — max results (default 50)
 *   search  — text search
 */

import { Router, Request, Response } from "express";
import { fetchVaults, bestAPY, LiFiVault, getChainName } from "../lib/lifi.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      tokens: tokensParam,
      chains: chainsParam,
      minApy: minApyParam,
      limit: limitParam,
      search,
    } = req.query as Record<string, string | undefined>;

    const tokens = tokensParam?.split(",").map((t) => t.trim());
    const chainIds = chainsParam
      ?.split(",")
      .map((c) => parseInt(c.trim(), 10))
      .filter(Boolean);
    const minApy = minApyParam ? parseFloat(minApyParam) / 100 : 0;
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 200) : 50;

    const allVaults = await fetchVaults({ tokens, limit: 500 });

    let vaults: LiFiVault[] = allVaults
      .filter((v) => v.isTransactional && bestAPY(v) > 0)
      .filter((v) => !chainIds?.length || chainIds.includes(v.chainId))
      .filter((v) => bestAPY(v) >= minApy)
      .filter((v) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          v.name.toLowerCase().includes(q) ||
          v.protocol.name.toLowerCase().includes(q) ||
          v.underlyingTokens.some((t) => t.symbol.toLowerCase().includes(q)) ||
          getChainName(v.chainId).toLowerCase().includes(q)
        );
      });

    vaults.sort((a, b) => bestAPY(b) - bestAPY(a));
    vaults = vaults.slice(0, limit);

    res.json({ vaults, total: vaults.length, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error("earn-vaults error:", err);
    res.status(502).json({ error: "Failed to fetch vaults from LI.FI Earn API" });
  }
});

export default router;
