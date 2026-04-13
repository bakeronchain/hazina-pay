/**
 * HazinaVault API Server
 *
 * Standalone Express backend that mirrors the Next.js API routes.
 * Use this for deployments where a dedicated Node.js server is preferred
 * over the Next.js serverless functions.
 *
 * Routes:
 *   POST /api/review-emergency  — Claude AI emergency review + Stacks signing
 *   GET  /api/earn-vaults       — LI.FI Earn Data API proxy
 *   POST /api/earn-agent        — Claude AI yield advisor
 *   GET  /api/earn-quote        — LI.FI Composer API proxy
 *   GET  /health                — health check
 */

import "dotenv/config";
import express from "express";
import cors from "cors";

import reviewEmergency from "./routes/reviewEmergency.js";
import earnVaults from "./routes/earnVaults.js";
import earnAgent from "./routes/earnAgent.js";
import earnQuote from "./routes/earnQuote.js";

const app = express();
const PORT = process.env.PORT ?? 4000;

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN ?? "http://localhost:3000",
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));

// ─── Routes ──────────────────────────────────────────────────────────────────

app.use("/api/review-emergency", reviewEmergency);
app.use("/api/earn-vaults", earnVaults);
app.use("/api/earn-agent", earnAgent);
app.use("/api/earn-quote", earnQuote);

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "hazina-pay-backend",
    timestamp: new Date().toISOString(),
    env: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      lifi: !!process.env.LIFI_API_KEY,
      relayer: !!process.env.AI_RELAYER_PRIVATE_KEY,
    },
  });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`HazinaVault API server running on http://localhost:${PORT}`);
  console.log(`  POST /api/review-emergency`);
  console.log(`  GET  /api/earn-vaults`);
  console.log(`  POST /api/earn-agent`);
  console.log(`  GET  /api/earn-quote`);
  console.log(`  GET  /health`);
});
