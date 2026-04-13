"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GoldButton } from "@/components/GoldButton";
import { useEmergencyWithdraw, useUserAddress } from "@/lib/hooks";
import { explorerTxUrl } from "@/lib/stacks";

function toMicro(amount: string, decimals = 6): bigint {
  const n = parseFloat(amount);
  if (isNaN(n) || n <= 0) return BigInt(0);
  return BigInt(Math.round(n * 10 ** decimals));
}

export default function EmergencyPage() {
  const router = useRouter();
  const address = useUserAddress();
  const { mutateAsync: emergencyWithdraw, isPending, error } = useEmergencyWithdraw();

  const fileRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [txId, setTxId] = useState<string | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!imageFile || !description.trim() || !amountInput) return;
    setRejection(null);
    const amount = toMicro(amountInput);
    try {
      const { txId: id } = await emergencyWithdraw({
        amount,
        reason: description.trim(),
        imageFile,
      });
      setTxId(id);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("approved")) setRejection(msg);
      console.error(e);
    }
  }

  const canSubmit =
    !!imageFile && description.trim().length >= 10 && toMicro(amountInput) > BigInt(0);

  if (txId) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-8">
          <p className="mb-2 text-xl font-semibold text-green-400">Emergency Withdrawal Approved!</p>
          <p className="mb-4 text-sm text-zinc-400">
            Your funds are being returned. Note: accrued yield is forfeited as
            per the emergency policy.
          </p>
          <a
            href={explorerTxUrl(txId)}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-6 block font-mono text-xs text-yellow-400 underline"
          >
            View on Explorer ↗
          </a>
          <GoldButton onClick={() => router.push("/dashboard")}>
            Back to Dashboard
          </GoldButton>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-2xl">🚨</span>
        <h1 className="text-3xl font-bold text-white">Emergency Withdrawal</h1>
      </div>
      <p className="mb-8 text-zinc-400">
        Submit evidence of a genuine emergency. Claude AI reviews your request
        and signs the approval if confidence ≥ 75%. You can use this up to 3
        times. Yield is forfeited; principal only is returned.
      </p>

      {/* Amount */}
      <div className="mb-5">
        <label className="mb-1 block text-sm text-zinc-300">
          Amount to withdraw (USDA)
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-600 focus:border-orange-500 focus:outline-none"
        />
      </div>

      {/* Description */}
      <div className="mb-5">
        <label className="mb-1 block text-sm text-zinc-300">
          Describe your emergency (be specific)
        </label>
        <textarea
          rows={4}
          placeholder="E.g. My motorcycle was stolen yesterday — it's my only income source as a delivery rider. I need funds to replace it."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-600 focus:border-orange-500 focus:outline-none resize-none"
        />
        <p className="mt-1 text-xs text-zinc-500">{description.length}/1000</p>
      </div>

      {/* Photo upload */}
      <div className="mb-8">
        <label className="mb-1 block text-sm text-zinc-300">
          Upload evidence (photo / document)
        </label>
        <div
          onClick={() => fileRef.current?.click()}
          className="cursor-pointer rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-6 text-center hover:border-orange-500/50 transition-colors"
        >
          {imagePreview ? (
            <img
              src={imagePreview}
              alt="Preview"
              className="mx-auto max-h-48 rounded-lg object-contain"
            />
          ) : (
            <>
              <p className="text-zinc-400">Click to upload image</p>
              <p className="text-xs text-zinc-600 mt-1">JPG, PNG, WEBP — max 10 MB</p>
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {rejection && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {rejection}
        </div>
      )}

      {error && !rejection && (
        <p className="mb-4 text-sm text-red-400">{(error as Error).message}</p>
      )}

      <GoldButton
        onClick={handleSubmit}
        loading={isPending}
        disabled={!canSubmit}
        className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white"
      >
        {isPending ? "Reviewing with AI…" : "Submit Emergency Request"}
      </GoldButton>
    </main>
  );
}
