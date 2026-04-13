/**
 * POST /api/earn-agent
 *
 * AI yield advisor: natural language → vault recommendation.
 * Uses Claude + live LI.FI Earn Data API.
 *
 * Body: { message: string; walletAddress?: string }
 */

import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { fetchVaults, bestAPY, formatAPY, formatTVL, getChainName } from "../lib/lifi.js";

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an AI yield advisor for HazinaVault — a savings platform for gig workers across Africa.

Analyse real-time DeFi vault data from LI.FI's Earn API and recommend the best yield opportunity.

Guidelines:
- Safety first: higher TVL = more battle-tested (Aave, Morpho, Compound are blue-chip)
- Balance APY vs risk: 5-15% APY in stablecoins is reasonable; >30% is high risk
- L2s (Arbitrum, Base, Optimism) have cheaper gas; Ethereum is most secure
- Match the user's token preference if mentioned
- Weight TVL heavily for "safest"; weight APY heavily for "highest yield"
- Be concise and actionable — 2-4 sentences max, no markdown headers

End with the vault address and chain so the user can click Deposit.`;

router.post("/", async (req: Request, res: Response) => {
  try {
    const { message, walletAddress } = req.body as { message?: string; walletAddress?: string };

    if (!message?.trim()) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    // Fetch live vault data
    const rawVaults = await fetchVaults({ limit: 200 }).catch(() => []);

    const summaries = rawVaults
      .filter((v) => v.isTransactional && bestAPY(v) > 0)
      .sort((a, b) => bestAPY(b) - bestAPY(a))
      .slice(0, 25)
      .map((v) => ({
        address: v.address,
        name: v.name,
        protocol: v.protocol.name,
        chain: getChainName(v.chainId),
        chainId: v.chainId,
        tokens: v.underlyingTokens.map((t) => t.symbol).join(", "),
        apy: formatAPY(bestAPY(v)),
        apyRaw: bestAPY(v),
        tvl: formatTVL(v.analytics.tvl.usd),
        tvlRaw: v.analytics.tvl.usd,
      }));

    const completion = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: `User wallet: ${walletAddress ?? "not connected"}\n\nVaults (top 25 by APY):\n${JSON.stringify(summaries, null, 2)}\n\nRequest: "${message}"`,
      }],
    });

    const reply = completion.content[0].type === "text" ? completion.content[0].text.trim() : "";

    const addrMatch = reply.match(/0x[a-fA-F0-9]{40}/);
    const recommendedVault = addrMatch
      ? summaries.find((v) => v.address.toLowerCase() === addrMatch[0].toLowerCase()) ?? summaries[0]
      : summaries[0];

    res.json({ message: reply, recommendedVault: recommendedVault ?? null, vaults: summaries.slice(0, 6) });
  } catch (err) {
    console.error("earn-agent error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
