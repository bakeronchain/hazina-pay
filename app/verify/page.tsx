"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GoldButton } from "@/components/GoldButton";
import { useVerifySelf, useUserAddress } from "@/lib/hooks";

/**
 * Identity Verification page.
 *
 * Flow:
 *  1. User provides their identity nullifier + the AI-relayer signature
 *     (in production these come from the Self Protocol / backend flow).
 *  2. The contract records the nullifier and marks the vault as verified.
 *
 * For the MVP, the backend /api/verify-self endpoint handles the
 * off-chain identity check and returns the signed (nullifier, signature).
 */
export default function VerifyPage() {
  const router = useRouter();
  const address = useUserAddress();
  const { mutateAsync: verifySelf, isPending, error } = useVerifySelf();

  const [status, setStatus] = useState<"idle" | "requesting" | "signing" | "done">("idle");
  const [txId, setTxId] = useState<string | null>(null);

  async function handleVerify() {
    if (!address) return;
    setStatus("requesting");

    try {
      // Request a signed nullifier from the backend
      const res = await fetch("/api/verify-self", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress: address }),
      });

      if (!res.ok) throw new Error("Verification request failed");
      const { nullifier: nullifierHex, signature: sigHex } = await res.json();

      const nullifier = Uint8Array.from(Buffer.from(nullifierHex.replace("0x", ""), "hex"));
      const signature = Uint8Array.from(Buffer.from(sigHex.replace("0x", ""), "hex"));

      setStatus("signing");
      const { txId: id } = await verifySelf({ nullifier, signature });
      setTxId(id);
      setStatus("done");
    } catch (e) {
      console.error(e);
      setStatus("idle");
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold text-white">Verify Identity</h1>
      <p className="mb-8 text-zinc-400">
        HazinaVault enforces one vault per verified person. Your government ID
        is checked off-chain; only a privacy-preserving nullifier is stored on
        the blockchain.
      </p>

      {status === "done" ? (
        <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-6 text-center">
          <p className="mb-2 font-semibold text-green-400">Identity Verified!</p>
          {txId && (
            <p className="mb-4 font-mono text-xs text-zinc-400">
              tx: {txId.slice(0, 20)}…
            </p>
          )}
          <GoldButton onClick={() => router.push("/create-vault")}>
            Create Your Vault
          </GoldButton>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full border border-yellow-500/30 bg-yellow-500/10 text-3xl">
            🪪
          </div>
          <p className="mb-6 text-sm text-zinc-400">
            Click below to start the identity verification flow. You'll be
            prompted to scan a QR code with your government ID or passport.
          </p>

          {error && (
            <p className="mb-4 text-sm text-red-400">
              {(error as Error).message}
            </p>
          )}

          <GoldButton
            onClick={handleVerify}
            loading={status !== "idle"}
            disabled={!address}
          >
            {status === "requesting"
              ? "Requesting approval…"
              : status === "signing"
              ? "Confirm in wallet…"
              : "Start Verification"}
          </GoldButton>
        </div>
      )}
    </main>
  );
}
