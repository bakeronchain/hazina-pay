/**
 * GET /api/earn-quote
 *
 * Server-side proxy to the LI.FI Composer API (/v1/quote).
 * Keeps LIFI_API_KEY out of the browser bundle.
 *
 * Query params (all required):
 *   fromChain   — source chain ID e.g. "42161"
 *   toChain     — destination chain ID (usually same as vault's chainId)
 *   fromToken   — source token symbol e.g. "USDC"
 *   toToken     — VAULT CONTRACT ADDRESS (not underlying token!)
 *   fromAddress — sender's EVM wallet address
 *   toAddress   — recipient (usually same as fromAddress)
 *   fromAmount  — amount in token's smallest unit e.g. "1000000" for 1 USDC
 *
 * Returns: LI.FI Composer quote with transactionRequest ready for signing.
 *
 * IMPORTANT: toToken must be the vault address, not the underlying asset.
 * See: https://docs.li.fi/composer/overview
 */

import { NextRequest, NextResponse } from "next/server";
import { getDepositQuote } from "@/lib/composer";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const fromChain = searchParams.get("fromChain");
    const toChain = searchParams.get("toChain");
    const fromToken = searchParams.get("fromToken");
    const toToken = searchParams.get("toToken");
    const fromAddress = searchParams.get("fromAddress");
    const toAddress = searchParams.get("toAddress");
    const fromAmount = searchParams.get("fromAmount");

    if (!fromChain || !toChain || !fromToken || !toToken || !fromAddress || !toAddress || !fromAmount) {
      return NextResponse.json(
        {
          error: "Missing required params: fromChain, toChain, fromToken, toToken, fromAddress, toAddress, fromAmount",
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.LIFI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "LIFI_API_KEY is not configured. Get one at portal.li.fi" },
        { status: 500 }
      );
    }

    const quote = await getDepositQuote(
      { fromChain, toChain, fromToken, toToken, fromAddress, toAddress, fromAmount },
      apiKey
    );

    return NextResponse.json(quote);
  } catch (err) {
    console.error("earn-quote error:", err);
    const message = err instanceof Error ? err.message : "Failed to get quote";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
