/**
 * GET /api/earn-quote
 *
 * Proxy to LI.FI Composer API (/v1/quote).
 * Keeps LIFI_API_KEY server-side.
 *
 * Query params (all required):
 *   fromChain, toChain, fromToken, toToken (vault address!),
 *   fromAddress, toAddress, fromAmount
 */

import { Router, Request, Response } from "express";

const COMPOSER_API = "https://li.quest";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const { fromChain, toChain, fromToken, toToken, fromAddress, toAddress, fromAmount } =
      req.query as Record<string, string | undefined>;

    if (!fromChain || !toChain || !fromToken || !toToken || !fromAddress || !toAddress || !fromAmount) {
      res.status(400).json({ error: "Missing required query params" });
      return;
    }

    const apiKey = process.env.LIFI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "LIFI_API_KEY not configured — get one at portal.li.fi" });
      return;
    }

    const url = new URL(`${COMPOSER_API}/v1/quote`);
    Object.entries({ fromChain, toChain, fromToken, toToken, fromAddress, toAddress, fromAmount })
      .forEach(([k, v]) => url.searchParams.set(k, v!));

    // IMPORTANT: This is a GET request — do NOT convert to POST
    const upstream = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json", "x-lifi-api-key": apiKey },
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      res.status(upstream.status).json(data);
      return;
    }

    res.json(data);
  } catch (err) {
    console.error("earn-quote error:", err);
    res.status(502).json({ error: err instanceof Error ? err.message : "Failed to get quote" });
  }
});

export default router;
