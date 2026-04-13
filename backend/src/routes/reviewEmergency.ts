/**
 * POST /api/review-emergency
 *
 * AI-powered emergency withdrawal review using Claude vision.
 * Accepts multipart/form-data with image evidence.
 * Returns { approved, signature?, message }.
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import {
  createStacksPrivateKey,
  signWithKey,
  serializeCV,
  principalCV,
  uintCV,
  stringAsciiCV,
} from "@stacks/transactions";

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

function buildMsgHash(userAddress: string, amount: bigint, reason: string): Buffer {
  const hashOf = (buf: Buffer) => createHash("sha256").update(buf).digest();
  const userBytes = Buffer.from(serializeCV(principalCV(userAddress)));
  const amountBytes = Buffer.from(serializeCV(uintCV(amount)));
  const reasonBytes = Buffer.from(serializeCV(stringAsciiCV(reason.slice(0, 256))));
  return createHash("sha256")
    .update(Buffer.concat([hashOf(userBytes), hashOf(amountBytes), hashOf(reasonBytes)]))
    .digest();
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

    const privateKeyHex = process.env.AI_RELAYER_PRIVATE_KEY;
    if (!privateKeyHex) {
      res.status(500).json({ error: "AI_RELAYER_PRIVATE_KEY not configured" });
      return;
    }

    const msgHash = buildMsgHash(userAddress, amount, description);
    const privateKey = createStacksPrivateKey(privateKeyHex);
    const { data: signatureHex } = signWithKey(privateKey, msgHash.toString("hex"));

    res.json({ approved: true, signature: `0x${signatureHex}`, message: review.reason });
  } catch (err) {
    console.error("review-emergency error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
