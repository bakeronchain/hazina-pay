/**
 * POST /api/earn-agent
 *
 * AI yield advisor powered by Claude + LI.FI Earn Data API.
 *
 * Accepts a natural language request like:
 *   "put my USDC into the safest vault above 5% APY on Arbitrum"
 *
 * Steps:
 *   1. Fetch live vault data from LI.FI Earn API
 *   2. Filter to relevant vaults based on message context
 *   3. Ask Claude to analyse and recommend the best option
 *   4. Return recommendation + filtered vault list
 *
 * Body: { message: string; walletAddress?: string }
 * Response: { message: string; recommendedVault: VaultSummary | null; vaults: VaultSummary[] }
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchVaults, formatAPY, formatTVL, getChainName, bestAPY, LiFiVault } from "@/lib/lifi";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Types ─────────────────────────────────────────────────────────────────

interface VaultSummary {
  address: string;
  name: string;
  protocol: string;
  chain: string;
  chainId: number;
  tokens: string;
  apy: string;
  apyRaw: number;
  tvl: string;
  tvlRaw: string;
  isTransactional: boolean;
}

// ─── System prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an AI yield advisor integrated into HazinaVault — a savings platform for gig workers across Africa.

Your job: analyse real-time DeFi vault data from LI.FI's Earn API and recommend the best yield opportunity for the user's specific needs.

Guidelines:
- Prioritise safety first: higher TVL = more battle-tested (Aave, Morpho, Compound are blue-chip)
- Balance APY vs risk: 5-15% APY in stablecoins = reasonable; >30% = high risk, flag it
- Consider chain preference: L2s (Arbitrum, Base, Optimism) = cheaper gas; Ethereum = most secure
- If the user mentions a token (USDC, USDT, DAI), only recommend vaults with that token
- If user says "safest", weight TVL heavily; if "highest yield", weight APY heavily
- Always be concise and actionable — this is a financial tool, not a blog post
- Lead with your top recommendation, then briefly explain why
- End with the vault address and chain so the user can click to deposit

Response format: 2-4 sentences max. No bullet points. No markdown headers. Just a clear recommendation.`;

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message: string = body.message?.trim();
    const walletAddress: string | undefined = body.walletAddress;

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    // 1. Fetch live vault data
    let rawVaults: LiFiVault[] = [];
    try {
      rawVaults = await fetchVaults({ limit: 200 });
    } catch (err) {
      console.error("Failed to fetch vaults for earn-agent:", err);
    }

    // 2. Filter to transactional vaults with valid APY, sort by APY desc
    const filtered = rawVaults
      .filter((v) => v.isTransactional && bestAPY(v) > 0)
      .sort((a, b) => bestAPY(b) - bestAPY(a));

    // 3. Build compact summaries (limit to top 25 to keep context tight)
    const summaries: VaultSummary[] = filtered.slice(0, 25).map((v) => ({
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
      isTransactional: v.isTransactional,
    }));

    // 4. Ask Claude
    const completion = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `User wallet: ${walletAddress ?? "not connected"}

Live vault data (${summaries.length} vaults, sorted by APY):
${JSON.stringify(summaries, null, 2)}

User's request: "${message}"`,
        },
      ],
    });

    const reply =
      completion.content[0].type === "text" ? completion.content[0].text.trim() : "";

    // 5. Determine the recommended vault (heuristic: extract address from Claude's reply or use #1)
    let recommendedVault: VaultSummary | null = null;

    // Try to find a mentioned address in the reply
    const addrMatch = reply.match(/0x[a-fA-F0-9]{40}/);
    if (addrMatch) {
      recommendedVault =
        summaries.find((v) => v.address.toLowerCase() === addrMatch[0].toLowerCase()) ??
        summaries[0] ??
        null;
    } else {
      recommendedVault = summaries[0] ?? null;
    }

    return NextResponse.json({
      message: reply,
      recommendedVault,
      vaults: summaries.slice(0, 6), // top 6 for sidebar display
    });
  } catch (err) {
    console.error("earn-agent error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
