/**
 * lib/hooks.ts
 *
 * React hooks for all contract interactions and vault data.
 * Uses @stacks/connect for wallet signing and @tanstack/react-query
 * for caching / refetching.
 */

"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { openContractCall } from "@stacks/connect";
import { getConnectedAddress } from "./wallet";
import {
  getVault,
  getPendingYield,
  getGroupVault,
  getMemberBalance,
  network,
  VAULT_CONTRACT,
  GROUP_VAULT_CONTRACT,
  TOKEN_CONTRACT,
} from "./stacks";
import {
  uintCV,
  stringAsciiCV,
  bufferCV,
  contractPrincipalCV,
  AnchorMode,
  PostConditionMode,
  FungibleConditionCode,
  makeStandardFungiblePostCondition,
  createAssetInfo,
} from "@stacks/transactions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VaultData {
  balance: bigint;
  unlockBlock: bigint;
  depositBlock: bigint;
  verified: boolean;
  emergencyCount: number;
}

export interface GroupVaultData {
  creator: string;
  createdAt: bigint;
  lockMonths: number;
  yieldApy: number;
  yieldReserve: bigint;
  memberCount: number;
}

// ─── Address helpers ──────────────────────────────────────────────────────────

/** Read the connected Stacks address. Kept in module scope so mutations can
 *  trigger re-renders via a simple subscriber list. */
let _addr: string | null = null;
const _subs: Set<() => void> = new Set();

export function setUserAddress(addr: string | null) {
  _addr = addr;
  _subs.forEach((fn) => fn());
}

export function useUserAddress(): string | null {
  const [addr, setAddr] = useState<string | null>(() => _addr ?? getConnectedAddress());

  useEffect(() => {
    // Sync on mount in case the session was already active
    const current = getConnectedAddress();
    if (current !== _addr) setUserAddress(current);
    setAddr(_addr);

    const notify = () => setAddr(_addr);
    _subs.add(notify);
    return () => { _subs.delete(notify); };
  }, []);

  return addr;
}

// ─── Utility: parse Clarity response to bigint ───────────────────────────────

function parseUint(clarityResult: { result?: string }): bigint {
  const hex = clarityResult?.result ?? "0x00";
  // Clarity uint serialises as "0u<decimal>" or as a hex CV
  const match = hex.match(/u(\d+)/);
  if (match) return BigInt(match[1]);
  return BigInt(0);
}

// ─── Blocks → approximate days remaining ─────────────────────────────────────

export function blocksToApproxDays(blocks: bigint): number {
  // Bitcoin mines ~144 blocks/day
  return Number(blocks) / 144;
}

export function lockProgress(
  depositBlock: bigint,
  unlockBlock: bigint,
  currentBlock: bigint
): number {
  const total = Number(unlockBlock - depositBlock);
  const elapsed = Number(currentBlock - depositBlock);
  if (total <= 0) return 100;
  return Math.min(100, Math.round((elapsed / total) * 100));
}

// ─── Vault data ───────────────────────────────────────────────────────────────

export function useVaultData(address: string | null) {
  return useQuery({
    queryKey: ["vault", address],
    queryFn: async () => {
      if (!address) return null;
      const [vaultRes, yieldRes] = await Promise.all([
        getVault(address),
        getPendingYield(address),
      ]);
      return { raw: vaultRes, pendingYield: parseUint(yieldRes) };
    },
    enabled: !!address,
    refetchInterval: 15_000,
  });
}

// ─── Token balance ────────────────────────────────────────────────────────────

export function useTokenBalance(address: string | null) {
  return useQuery({
    queryKey: ["token-balance", address],
    queryFn: async () => {
      if (!address) return BigInt(0);
      const [tokenAddr, tokenName] = TOKEN_CONTRACT.split(".");
      const apiBase =
        process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet"
          ? "https://api.hiro.so"
          : "https://api.testnet.hiro.so";
      const res = await fetch(
        `${apiBase}/v2/accounts/${address}/balances`
      );
      const data = await res.json();
      const key = `${tokenAddr}.${tokenName}`;
      const bal =
        data?.fungible_tokens?.[`${key}::${tokenName}`]?.balance ?? "0";
      return BigInt(bal);
    },
    enabled: !!address,
    refetchInterval: 15_000,
  });
}

// ─── Current burn block height ────────────────────────────────────────────────

export function useBurnBlockHeight() {
  return useQuery({
    queryKey: ["burn-block-height"],
    queryFn: async () => {
      const apiBase =
        process.env.NEXT_PUBLIC_STACKS_NETWORK === "mainnet"
          ? "https://api.hiro.so"
          : "https://api.testnet.hiro.so";
      const res = await fetch(`${apiBase}/v2/info`);
      const data = await res.json();
      return BigInt(data.burn_block_height ?? 0);
    },
    refetchInterval: 60_000,
  });
}

// ─── Identity verification ────────────────────────────────────────────────────

export function useVerifySelf() {
  const qc = useQueryClient();
  const address = useUserAddress();

  return useMutation({
    mutationFn: async ({
      nullifier,
      signature,
    }: {
      nullifier: Uint8Array;
      signature: Uint8Array;
    }) => {
      if (!address) throw new Error("Wallet not connected");
      const [contractAddr, contractName] = VAULT_CONTRACT.split(".");
      return new Promise<{ txId: string }>((resolve, reject) => {
        openContractCall({
          network,
          contractAddress: contractAddr,
          contractName,
          functionName: "verify-self",
          functionArgs: [bufferCV(nullifier), bufferCV(signature)],
          anchorMode: AnchorMode.Any,
          postConditionMode: PostConditionMode.Deny,
          postConditions: [],
          onFinish: (data) => resolve({ txId: data.txId }),
          onCancel: () => reject(new Error("Transaction cancelled")),
        });
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vault", address] }),
  });
}

// ─── Deposit ──────────────────────────────────────────────────────────────────

export function useDeposit() {
  const qc = useQueryClient();
  const address = useUserAddress();

  return useMutation({
    mutationFn: async ({
      amount,
      lockMonths,
    }: {
      amount: bigint;
      lockMonths: number;
    }) => {
      if (!address) throw new Error("Wallet not connected");
      const [contractAddr, contractName] = VAULT_CONTRACT.split(".");
      const [tokenAddr, tokenName] = TOKEN_CONTRACT.split(".");

      // Post-condition: user sends exactly `amount` of the token
      const postCondition = makeStandardFungiblePostCondition(
        address,
        FungibleConditionCode.Equal,
        amount,
        createAssetInfo(tokenAddr, tokenName, tokenName)
      );

      return new Promise<{ txId: string }>((resolve, reject) => {
        openContractCall({
          network,
          contractAddress: contractAddr,
          contractName,
          functionName: "deposit",
          functionArgs: [
            contractPrincipalCV(tokenAddr, tokenName),
            uintCV(amount),
            uintCV(lockMonths),
          ],
          anchorMode: AnchorMode.Any,
          postConditionMode: PostConditionMode.Deny,
          postConditions: [postCondition],
          onFinish: (data) => resolve({ txId: data.txId }),
          onCancel: () => reject(new Error("Transaction cancelled")),
        });
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vault", address] });
      qc.invalidateQueries({ queryKey: ["token-balance", address] });
    },
  });
}

// ─── Withdraw ─────────────────────────────────────────────────────────────────

export function useWithdraw() {
  const qc = useQueryClient();
  const address = useUserAddress();

  return useMutation({
    mutationFn: async () => {
      if (!address) throw new Error("Wallet not connected");
      const [contractAddr, contractName] = VAULT_CONTRACT.split(".");
      const [tokenAddr, tokenName] = TOKEN_CONTRACT.split(".");

      return new Promise<{ txId: string }>((resolve, reject) => {
        openContractCall({
          network,
          contractAddress: contractAddr,
          contractName,
          functionName: "withdraw",
          functionArgs: [contractPrincipalCV(tokenAddr, tokenName)],
          anchorMode: AnchorMode.Any,
          postConditionMode: PostConditionMode.Allow,
          postConditions: [],
          onFinish: (data) => resolve({ txId: data.txId }),
          onCancel: () => reject(new Error("Transaction cancelled")),
        });
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vault", address] });
      qc.invalidateQueries({ queryKey: ["token-balance", address] });
    },
  });
}

// ─── Emergency withdrawal ─────────────────────────────────────────────────────

export function useEmergencyWithdraw() {
  const qc = useQueryClient();
  const address = useUserAddress();

  return useMutation({
    mutationFn: async ({
      amount,
      reason,
      imageFile,
    }: {
      amount: bigint;
      reason: string;
      imageFile: File;
    }) => {
      if (!address) throw new Error("Wallet not connected");

      // Step 1: Submit to AI review endpoint
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("description", reason);
      formData.append("userAddress", address);
      formData.append("amount", amount.toString());

      const reviewRes = await fetch("/api/review-emergency", {
        method: "POST",
        body: formData,
      });

      if (!reviewRes.ok) {
        const err = await reviewRes.json();
        throw new Error(err.error ?? "AI review failed");
      }

      const { approved, signature: sigHex, message: reviewMsg } =
        await reviewRes.json();

      if (!approved) {
        throw new Error(reviewMsg ?? "Emergency request was not approved");
      }

      const signature = Uint8Array.from(
        Buffer.from(sigHex.replace("0x", ""), "hex")
      );

      // Step 2: Submit on-chain with the AI signature
      const [contractAddr, contractName] = VAULT_CONTRACT.split(".");
      const [tokenAddr, tokenName] = TOKEN_CONTRACT.split(".");

      return new Promise<{ txId: string }>((resolve, reject) => {
        openContractCall({
          network,
          contractAddress: contractAddr,
          contractName,
          functionName: "emergency-withdraw",
          functionArgs: [
            contractPrincipalCV(tokenAddr, tokenName),
            uintCV(amount),
            stringAsciiCV(reason.slice(0, 256)),
            bufferCV(signature),
          ],
          anchorMode: AnchorMode.Any,
          postConditionMode: PostConditionMode.Allow,
          postConditions: [],
          onFinish: (data) => resolve({ txId: data.txId }),
          onCancel: () => reject(new Error("Transaction cancelled")),
        });
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vault", address] });
      qc.invalidateQueries({ queryKey: ["token-balance", address] });
    },
  });
}

// ─── Group vault ──────────────────────────────────────────────────────────────

export function useGroupVaultData(vaultId: Uint8Array | null, member: string | null) {
  return useQuery({
    queryKey: ["group-vault", vaultId ? Buffer.from(vaultId).toString("hex") : null, member],
    queryFn: async () => {
      if (!vaultId) return null;
      const [vaultRes, balRes] = await Promise.all([
        getGroupVault(vaultId),
        member ? getMemberBalance(vaultId, member) : Promise.resolve(null),
      ]);
      return { vault: vaultRes, memberBalance: balRes ? parseUint(balRes) : null };
    },
    enabled: !!vaultId,
    refetchInterval: 15_000,
  });
}

export function useCreateVault() {
  const address = useUserAddress();

  return useMutation({
    mutationFn: async ({ lockMonths }: { lockMonths: number }) => {
      if (!address) throw new Error("Wallet not connected");
      const [contractAddr, contractName] = GROUP_VAULT_CONTRACT.split(".");

      return new Promise<{ txId: string }>((resolve, reject) => {
        openContractCall({
          network,
          contractAddress: contractAddr,
          contractName,
          functionName: "create-vault",
          functionArgs: [uintCV(lockMonths)],
          anchorMode: AnchorMode.Any,
          postConditionMode: PostConditionMode.Deny,
          postConditions: [],
          onFinish: (data) => resolve({ txId: data.txId }),
          onCancel: () => reject(new Error("Transaction cancelled")),
        });
      });
    },
  });
}

export function useJoinVault() {
  const address = useUserAddress();

  return useMutation({
    mutationFn: async ({ vaultId }: { vaultId: Uint8Array }) => {
      if (!address) throw new Error("Wallet not connected");
      const [contractAddr, contractName] = GROUP_VAULT_CONTRACT.split(".");

      return new Promise<{ txId: string }>((resolve, reject) => {
        openContractCall({
          network,
          contractAddress: contractAddr,
          contractName,
          functionName: "join-vault",
          functionArgs: [bufferCV(vaultId)],
          anchorMode: AnchorMode.Any,
          postConditionMode: PostConditionMode.Deny,
          postConditions: [],
          onFinish: (data) => resolve({ txId: data.txId }),
          onCancel: () => reject(new Error("Transaction cancelled")),
        });
      });
    },
  });
}

export function useGroupDeposit() {
  const qc = useQueryClient();
  const address = useUserAddress();

  return useMutation({
    mutationFn: async ({
      vaultId,
      amount,
    }: {
      vaultId: Uint8Array;
      amount: bigint;
    }) => {
      if (!address) throw new Error("Wallet not connected");
      const [contractAddr, contractName] = GROUP_VAULT_CONTRACT.split(".");
      const [tokenAddr, tokenName] = TOKEN_CONTRACT.split(".");

      const postCondition = makeStandardFungiblePostCondition(
        address,
        FungibleConditionCode.Equal,
        amount,
        createAssetInfo(tokenAddr, tokenName, tokenName)
      );

      return new Promise<{ txId: string }>((resolve, reject) => {
        openContractCall({
          network,
          contractAddress: contractAddr,
          contractName,
          functionName: "group-deposit",
          functionArgs: [
            contractPrincipalCV(tokenAddr, tokenName),
            bufferCV(vaultId),
            uintCV(amount),
          ],
          anchorMode: AnchorMode.Any,
          postConditionMode: PostConditionMode.Deny,
          postConditions: [postCondition],
          onFinish: (data) => resolve({ txId: data.txId }),
          onCancel: () => reject(new Error("Transaction cancelled")),
        });
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-vault"] });
      qc.invalidateQueries({ queryKey: ["token-balance", address] });
    },
  });
}

export function useGroupWithdraw() {
  const qc = useQueryClient();
  const address = useUserAddress();

  return useMutation({
    mutationFn: async ({ vaultId }: { vaultId: Uint8Array }) => {
      if (!address) throw new Error("Wallet not connected");
      const [contractAddr, contractName] = GROUP_VAULT_CONTRACT.split(".");
      const [tokenAddr, tokenName] = TOKEN_CONTRACT.split(".");

      return new Promise<{ txId: string }>((resolve, reject) => {
        openContractCall({
          network,
          contractAddress: contractAddr,
          contractName,
          functionName: "group-withdraw",
          functionArgs: [
            contractPrincipalCV(tokenAddr, tokenName),
            bufferCV(vaultId),
          ],
          anchorMode: AnchorMode.Any,
          postConditionMode: PostConditionMode.Allow,
          postConditions: [],
          onFinish: (data) => resolve({ txId: data.txId }),
          onCancel: () => reject(new Error("Transaction cancelled")),
        });
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-vault"] });
      qc.invalidateQueries({ queryKey: ["token-balance", address] });
    },
  });
}

export function useGroupEmergencyWithdraw() {
  const qc = useQueryClient();
  const address = useUserAddress();

  return useMutation({
    mutationFn: async ({
      vaultId,
      amount,
      reason,
      imageFile,
    }: {
      vaultId: Uint8Array;
      amount: bigint;
      reason: string;
      imageFile: File;
    }) => {
      if (!address) throw new Error("Wallet not connected");

      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("description", reason);
      formData.append("userAddress", address);
      formData.append("amount", amount.toString());
      formData.append("vaultId", Buffer.from(vaultId).toString("hex"));

      const reviewRes = await fetch("/api/review-emergency", {
        method: "POST",
        body: formData,
      });

      if (!reviewRes.ok) {
        const err = await reviewRes.json();
        throw new Error(err.error ?? "AI review failed");
      }

      const { approved, signature: sigHex, message: reviewMsg } =
        await reviewRes.json();
      if (!approved) throw new Error(reviewMsg ?? "Not approved");

      const signature = Uint8Array.from(
        Buffer.from(sigHex.replace("0x", ""), "hex")
      );

      const [contractAddr, contractName] = GROUP_VAULT_CONTRACT.split(".");
      const [tokenAddr, tokenName] = TOKEN_CONTRACT.split(".");

      return new Promise<{ txId: string }>((resolve, reject) => {
        openContractCall({
          network,
          contractAddress: contractAddr,
          contractName,
          functionName: "group-emergency-withdraw",
          functionArgs: [
            contractPrincipalCV(tokenAddr, tokenName),
            bufferCV(vaultId),
            uintCV(amount),
            stringAsciiCV(reason.slice(0, 256)),
            bufferCV(signature),
          ],
          anchorMode: AnchorMode.Any,
          postConditionMode: PostConditionMode.Allow,
          postConditions: [],
          onFinish: (data) => resolve({ txId: data.txId }),
          onCancel: () => reject(new Error("Transaction cancelled")),
        });
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-vault"] });
      qc.invalidateQueries({ queryKey: ["token-balance", address] });
    },
  });
}
