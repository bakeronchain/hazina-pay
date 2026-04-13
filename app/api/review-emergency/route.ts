/**
 * POST /api/review-emergency
 *
 * Accepts a multipart form submission containing:
 *   - image       File   — photographic evidence of the emergency
 *   - description string — user's written description (≤ 1 000 chars)
 *   - userAddress string — caller's Stacks principal
 *   - amount      string — requested amount in micro-units
 *   - vaultId?    string — hex vault-id (group vaults only)
 *
 * Returns:
 *   { approved: true,  signature: "0x<hex>", message: "..." }
 *   { approved: false, message: "..." }
 *
 * Signing:
 *   Uses the Stacks private key in AI_RELAYER_PRIVATE_KEY to produce a
 *   secp256k1 signature over:
 *     sha256(sha256(userAddress) ‖ sha256(amount) ‖ sha256(description))
 *
 *   This mirrors the on-chain emergency-msg-hash construction so the
 *   Clarity contract can verify it with secp256k1-recover?.
 */

import { NextRequest, NextResponse } from "next/server";
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

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── Message hash ─────────────────────────────────────────────────────────────

/**
 * Recreate the on-chain emergency-msg-hash:
 *   sha256(sha256(user) ‖ sha256(amount) ‖ sha256(reason))
 * where each component is hashed via Clarity's to-consensus-buff serialisation.
 */
function buildMsgHash(
  userAddress: string,
  amount: bigint,
  reason: string
): Buffer {
  const hashOf = (buf: Buffer) => createHash("sha256").update(buf).digest();

  // Clarity consensus-buff for principal: 0x05 type-prefix + 1-byte version + 20-byte hash160
  // Using @stacks/transactions serializeCV gives us the exact bytes Clarity produces
  const userBytes = Buffer.from(serializeCV(principalCV(userAddress)));
  const amountBytes = Buffer.from(serializeCV(uintCV(amount)));
  const reasonBytes = Buffer.from(serializeCV(stringAsciiCV(reason.slice(0, 256))));

  const combined = Buffer.concat([
    hashOf(userBytes),
    hashOf(amountBytes),
    hashOf(reasonBytes),
  ]);
  return createHash("sha256").update(combined).digest();
}

// ─── AI review ───────────────────────────────────────────────────────────────

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

    // Convert image to base64 for the vision API
    const imageBytes = await image.arrayBuffer();
    const base64Image = Buffer.from(imageBytes).toString("base64");
    const mediaType = (image.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp") || "image/jpeg";

    // ── Claude vision review ──────────────────────────────────────────────────
    const completion = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64Image },
            },
            {
              type: "text",
              text: `Emergency description: "${description}"\n\nPlease evaluate this emergency withdrawal request.`,
            },
          ],
        },
      ],
    });

    const rawText = completion.content[0].type === "text"
      ? completion.content[0].text.trim()
      : "";

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

    // Require ≥ 75% confidence to approve
    const approved = review.approved && review.confidence >= 75;

    if (!approved) {
      return NextResponse.json({
        approved: false,
        message: review.reason,
      });
    }

    // ── Sign the approval ─────────────────────────────────────────────────────
    const privateKeyHex = process.env.AI_RELAYER_PRIVATE_KEY;
    if (!privateKeyHex) {
      console.error("AI_RELAYER_PRIVATE_KEY not set");
      return NextResponse.json(
        { error: "Server signing key not configured" },
        { status: 500 }
      );
    }

    const msgHash = buildMsgHash(userAddress, amount, description);
    const privateKey = createStacksPrivateKey(privateKeyHex);
    const { data: signatureHex } = signWithKey(privateKey, msgHash.toString("hex"));

    // signWithKey returns a 65-byte signature (recovery-id ‖ r ‖ s) as hex
    return NextResponse.json({
      approved: true,
      signature: `0x${signatureHex}`,
      message: review.reason,
    });
  } catch (error) {
    console.error("review-emergency error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
