/**
 * POST /api/review-emergency
 *
 * Accepts a multipart form submission containing:
 *   - image       File   — photographic evidence of the emergency
 *   - description string — user's written description (≤ 1 000 chars)
 *   - userAddress string — caller's Stellar G-address
 *   - amount      string — requested amount in stroops (7 decimals)
 *
 * Returns:
 *   { approved: true,  signature: "0x<hex>", message: "..." }
 *   { approved: false, message: "..." }
 *
 * Signing:
 *   Ed25519 signature by AI_RELAYER_PRIVATE_KEY over the same message hash
 *   the Soroban contract constructs in build_msg_hash:
 *     sha256(amount_le16 ‖ reason_xdr)
 *   where reason_xdr = 4-byte BE length + UTF-8 bytes (Soroban String XDR).
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createHash, createPrivateKey, sign } from "crypto";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Message hash (mirrors Soroban build_msg_hash) ────────────────────────────

function buildMsgHash(amount: bigint, reason: string): Buffer {
  // amount as 16-byte little-endian i128
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

// ─── Ed25519 signing ──────────────────────────────────────────────────────────

function signEd25519(msgHash: Buffer, seedHex: string): Buffer {
  const seed = Buffer.from(seedHex, "hex");
  // Wrap 32-byte seed in PKCS#8 DER envelope for Node.js crypto
  const der = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    seed,
  ]);
  const privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  return sign(null, msgHash, privateKey);
}

// ─── AI system prompt ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a compassionate financial review assistant for HazinaVault,
a forced-savings platform for gig workers and informal earners in Africa.

Your job is to evaluate emergency withdrawal requests by looking at the submitted
image and description. These are real people in genuine hardship — approach every
case with empathy. Be a human first, auditor second.

Approve emergencies that include (but are not limited to):
- Medical bills, hospital receipts, prescriptions
- Eviction notices, overdue rent, utility cut-off notices
- Lost or damaged livelihood equipment (motorcycle, phone, tools)
- Death / bereavement costs
- Natural disaster or fire damage evidence
- Education fees about to cause dropout
- Legal fees for urgent matters
- General severe financial hardship with credible evidence

Reject only if:
- The image is clearly unrelated to any hardship (e.g. a random selfie with no context)
- The description contradicts the image outright
- There is obvious fraud (digitally fabricated documents, etc.)

Respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{
  "approved": true | false,
  "confidence": 0-100,
  "reason": "one-sentence explanation"
}`;

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();

    const image = form.get("image") as File | null;
    const description = (form.get("description") as string | null)?.trim();
    const userAddress = (form.get("userAddress") as string | null)?.trim();
    const amountStr = (form.get("amount") as string | null)?.trim();

    if (!image || !description || !userAddress || !amountStr) {
      return NextResponse.json(
        { error: "Missing required fields: image, description, userAddress, amount" },
        { status: 400 }
      );
    }

    const amount = BigInt(amountStr);

    const imageBytes = await image.arrayBuffer();
    const base64Image = Buffer.from(imageBytes).toString("base64");
    const mediaType =
      (image.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp") ||
      "image/jpeg";

    // ── Claude vision review ──────────────────────────────────────────────────
    const completion = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
            { type: "text", text: `Emergency description: "${description}"\n\nPlease evaluate this emergency withdrawal request.` },
          ],
        },
      ],
    });

    const rawText =
      completion.content[0].type === "text" ? completion.content[0].text.trim() : "";

    let review: { approved: boolean; confidence: number; reason: string };
    try {
      review = JSON.parse(rawText);
    } catch {
      console.error("Failed to parse AI response:", rawText);
      return NextResponse.json(
        { error: "AI review returned an unexpected format" },
        { status: 500 }
      );
    }

    const approved = review.approved && review.confidence >= 75;

    if (!approved) {
      return NextResponse.json({ approved: false, message: review.reason });
    }

    // ── Sign with Ed25519 (matches Soroban ed25519_verify) ────────────────────
    const seedHex = process.env.AI_RELAYER_PRIVATE_KEY;
    if (!seedHex) {
      console.error("AI_RELAYER_PRIVATE_KEY not set");
      return NextResponse.json({ error: "Server signing key not configured" }, { status: 500 });
    }

    const msgHash = buildMsgHash(amount, description);
    const signature = signEd25519(msgHash, seedHex);

    return NextResponse.json({
      approved: true,
      signature: `0x${signature.toString("hex")}`,
      message: review.reason,
    });
  } catch (error) {
    console.error("review-emergency error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
