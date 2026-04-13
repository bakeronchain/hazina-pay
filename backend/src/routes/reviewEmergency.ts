/**
 * POST /api/review-emergency
 *
 * AI-powered emergency withdrawal review using Claude vision.
 * Signs approval with Ed25519 to match the Soroban contract's ed25519_verify.
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import { createHash, createPrivateKey, sign } from "crypto";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a compassionate financial review assistant for HazinaVault,
a forced-savings platform for gig workers and informal earners in Africa.

Evaluate emergency withdrawal requests by reviewing the submitted image and description.
These are real people in genuine hardship — approach every case with empathy.

Approve emergencies involving: medical bills, eviction notices, lost livelihood equipment,
bereavement costs, natural disaster damage, education fees, or general severe hardship.

Reject only if the image is clearly unrelated, contradicts the description, or shows obvious fraud.

Respond ONLY with valid JSON (no markdown):
{ "approved": true | false, "confidence": 0-100, "reason": "one-sentence explanation" }`;

function buildMsgHash(amount: bigint, reason: string): Buffer {
  // amount as 16-byte little-endian i128 (mirrors Soroban build_msg_hash)
  const amountBuf = Buffer.alloc(16);
  let amt = amount < 0n ? amount + (1n << 128n) : amount;
  for (let i = 0; i < 16; i++) {
    amountBuf[i] = Number(amt & 0xffn);
    amt >>= 8n;
  }

  // reason as Soroban String XDR: 4-byte BE length + UTF-8
  const reasonUtf8 = Buffer.from(reason, "utf8");
  const reasonXdr = Buffer.alloc(4 + reasonUtf8.length);
  reasonXdr.writeUInt32BE(reasonUtf8.length, 0);
  reasonUtf8.copy(reasonXdr, 4);

  return createHash("sha256").update(Buffer.concat([amountBuf, reasonXdr])).digest();
}

function signEd25519(msgHash: Buffer, seedHex: string): Buffer {
  const seed = Buffer.from(seedHex, "hex");
  const der = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    seed,
  ]);
  const privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  return sign(null, msgHash, privateKey);
}

router.post("/", upload.single("image"), async (req: Request, res: Response) => {
  try {
    const { description, userAddress, amount: amountStr } = req.body as Record<string, string>;
    const image = req.file;

    if (!image || !description || !userAddress || !amountStr) {
      res.status(400).json({ error: "Missing required fields: image, description, userAddress, amount" });
      return;
    }

    const amount = BigInt(amountStr);
    const base64Image = image.buffer.toString("base64");
    const mediaType = (image.mimetype as "image/jpeg" | "image/png" | "image/webp") || "image/jpeg";

    const completion = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
          { type: "text", text: `Emergency description: "${description}"\n\nPlease evaluate this request.` },
        ],
      }],
    });

    const rawText = completion.content[0].type === "text" ? completion.content[0].text.trim() : "";
    const review = JSON.parse(rawText) as { approved: boolean; confidence: number; reason: string };
    const approved = review.approved && review.confidence >= 75;

    if (!approved) {
      res.json({ approved: false, message: review.reason });
      return;
    }

    const seedHex = process.env.AI_RELAYER_PRIVATE_KEY;
    if (!seedHex) {
      res.status(500).json({ error: "AI_RELAYER_PRIVATE_KEY not configured" });
      return;
    }

    const msgHash = buildMsgHash(amount, description);
    const signature = signEd25519(msgHash, seedHex);

    res.json({ approved: true, signature: `0x${signature.toString("hex")}`, message: review.reason });
  } catch (err) {
    console.error("review-emergency error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
