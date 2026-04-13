/**
 * lib/stacks.ts
 *
 * Network config, contract addresses, and typed contract-call builders
 * for both HazinaVault (individual) and HazinaGroupVault (group).
 *
 * All amounts are in micro-units of the accepted SIP-010 token
 * (e.g. 1 USDA = 1_000_000 micro-USDA).
 */

import {
  StacksMainnet,
  StacksTestnet,
  StacksMocknet,
} from "@stacks/network";
import {
  makeUnsignedContractCall,
  broadcastTransaction,
  serializeCV,
  AnchorMode,
  PostConditionMode,
  uintCV,
  stringAsciiCV,
  bufferCV,
  principalCV,
  contractPrincipalCV,
  FungibleConditionCode,
  makeStandardFungiblePostCondition,
  createAssetInfo,
  type StacksTransaction,
} from "@stacks/transactions";

// Alias so call sites don't need changing.
// Cast to `any` params because runtime signing is handled by the wallet
// callback — a publicKey/senderKey is not needed at construction time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeContractCall = makeUnsignedContractCall as unknown as (opts: any) => Promise<StacksTransaction>;

// ─── Network ────────────────────────────────────────────────────────────────

const networkName = process.env.NEXT_PUBLIC_STACKS_NETWORK ?? "testnet";

export const network =
  networkName === "mainnet"
    ? new StacksMainnet()
    : networkName === "devnet"
    ? new StacksMocknet()
    : new StacksTestnet();

// ─── Contract identifiers ────────────────────────────────────────────────────

export const VAULT_CONTRACT =
  process.env.NEXT_PUBLIC_VAULT_CONTRACT ?? "";

export const GROUP_VAULT_CONTRACT =
  process.env.NEXT_PUBLIC_GROUP_VAULT_CONTRACT ?? "";

export const TOKEN_CONTRACT =
  process.env.NEXT_PUBLIC_TOKEN_CONTRACT ?? "";

/** Split "SP123.contract-name" → { address, name } */
function parseContract(id: string) {
  const [address, name] = id.split(".");
  return { address, name };
}

// ─── Explorer helpers ────────────────────────────────────────────────────────

export function explorerTxUrl(txId: string) {
  const base =
    networkName === "mainnet"
      ? "https://explorer.hiro.so/txid"
      : "https://explorer.hiro.so/txid";
  const suffix = networkName !== "mainnet" ? "?chain=testnet" : "";
  return `${base}/${txId}${suffix}`;
}

// ─── Post-condition builder ───────────────────────────────────────────────────

/**
 * Build a standard fungible post-condition that asserts the user sends
 * exactly `amount` of the accepted token.
 */
function tokenPostCondition(senderAddress: string, amount: bigint) {
  const { address: tokenAddr, name: tokenName } = parseContract(TOKEN_CONTRACT);
  return makeStandardFungiblePostCondition(
    senderAddress,
    FungibleConditionCode.Equal,
    amount,
    createAssetInfo(tokenAddr, tokenName, tokenName)
  );
}

// ─── Individual vault calls ──────────────────────────────────────────────────

export async function callVerifySelf(
  _senderAddress: string,
  nullifier: Uint8Array,   // 32 bytes
  signature: Uint8Array,   // 65 bytes
  signTransaction: (tx: StacksTransaction) => Promise<StacksTransaction>
) {
  const { address, name } = parseContract(VAULT_CONTRACT);
  const tx = await makeContractCall({
    contractAddress: address,
    contractName: name,
    functionName: "verify-self",
    functionArgs: [bufferCV(nullifier), bufferCV(signature)],
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Deny,
    postConditions: [],
  });
  const signed = await signTransaction(tx);
  return broadcastTransaction(signed, network);
}

export async function callDeposit(
  senderAddress: string,
  amount: bigint,
  lockMonths: number,
  signTransaction: (tx: StacksTransaction) => Promise<StacksTransaction>
) {
  const { address, name } = parseContract(VAULT_CONTRACT);
  const { address: tokenAddr, name: tokenName } = parseContract(TOKEN_CONTRACT);
  const tx = await makeContractCall({
    contractAddress: address,
    contractName: name,
    functionName: "deposit",
    functionArgs: [
      contractPrincipalCV(tokenAddr, tokenName),
      uintCV(amount),
      uintCV(lockMonths),
    ],
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Deny,
    postConditions: [tokenPostCondition(senderAddress, amount)],
  });
  const signed = await signTransaction(tx);
  return broadcastTransaction(signed, network);
}

export async function callWithdraw(
  signTransaction: (tx: StacksTransaction) => Promise<StacksTransaction>
) {
  const { address, name } = parseContract(VAULT_CONTRACT);
  const { address: tokenAddr, name: tokenName } = parseContract(TOKEN_CONTRACT);
  const tx = await makeContractCall({
    contractAddress: address,
    contractName: name,
    functionName: "withdraw",
    functionArgs: [contractPrincipalCV(tokenAddr, tokenName)],
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow, // contract sends tokens out
    postConditions: [],
  });
  const signed = await signTransaction(tx);
  return broadcastTransaction(signed, network);
}

export async function callEmergencyWithdraw(
  amount: bigint,
  reason: string,
  signature: Uint8Array,  // 65-byte secp256k1 signature from AI relayer
  signTransaction: (tx: StacksTransaction) => Promise<StacksTransaction>
) {
  const { address, name } = parseContract(VAULT_CONTRACT);
  const { address: tokenAddr, name: tokenName } = parseContract(TOKEN_CONTRACT);
  const tx = await makeContractCall({
    contractAddress: address,
    contractName: name,
    functionName: "emergency-withdraw",
    functionArgs: [
      contractPrincipalCV(tokenAddr, tokenName),
      uintCV(amount),
      stringAsciiCV(reason),
      bufferCV(signature),
    ],
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
  const signed = await signTransaction(tx);
  return broadcastTransaction(signed, network);
}

// ─── Group vault calls ───────────────────────────────────────────────────────

export async function callCreateVault(
  lockMonths: number,
  signTransaction: (tx: StacksTransaction) => Promise<StacksTransaction>
) {
  const { address, name } = parseContract(GROUP_VAULT_CONTRACT);
  const tx = await makeContractCall({
    contractAddress: address,
    contractName: name,
    functionName: "create-vault",
    functionArgs: [uintCV(lockMonths)],
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Deny,
    postConditions: [],
  });
  const signed = await signTransaction(tx);
  return broadcastTransaction(signed, network);
}

export async function callJoinVault(
  vaultId: Uint8Array,  // 32-byte vault-id
  signTransaction: (tx: StacksTransaction) => Promise<StacksTransaction>
) {
  const { address, name } = parseContract(GROUP_VAULT_CONTRACT);
  const tx = await makeContractCall({
    contractAddress: address,
    contractName: name,
    functionName: "join-vault",
    functionArgs: [bufferCV(vaultId)],
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Deny,
    postConditions: [],
  });
  const signed = await signTransaction(tx);
  return broadcastTransaction(signed, network);
}

export async function callGroupDeposit(
  senderAddress: string,
  vaultId: Uint8Array,
  amount: bigint,
  signTransaction: (tx: StacksTransaction) => Promise<StacksTransaction>
) {
  const { address, name } = parseContract(GROUP_VAULT_CONTRACT);
  const { address: tokenAddr, name: tokenName } = parseContract(TOKEN_CONTRACT);
  const tx = await makeContractCall({
    contractAddress: address,
    contractName: name,
    functionName: "group-deposit",
    functionArgs: [
      contractPrincipalCV(tokenAddr, tokenName),
      bufferCV(vaultId),
      uintCV(amount),
    ],
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Deny,
    postConditions: [tokenPostCondition(senderAddress, amount)],
  });
  const signed = await signTransaction(tx);
  return broadcastTransaction(signed, network);
}

export async function callGroupWithdraw(
  vaultId: Uint8Array,
  signTransaction: (tx: StacksTransaction) => Promise<StacksTransaction>
) {
  const { address, name } = parseContract(GROUP_VAULT_CONTRACT);
  const { address: tokenAddr, name: tokenName } = parseContract(TOKEN_CONTRACT);
  const tx = await makeContractCall({
    contractAddress: address,
    contractName: name,
    functionName: "group-withdraw",
    functionArgs: [
      contractPrincipalCV(tokenAddr, tokenName),
      bufferCV(vaultId),
    ],
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
  const signed = await signTransaction(tx);
  return broadcastTransaction(signed, network);
}

export async function callGroupEmergencyWithdraw(
  vaultId: Uint8Array,
  amount: bigint,
  reason: string,
  signature: Uint8Array,
  signTransaction: (tx: StacksTransaction) => Promise<StacksTransaction>
) {
  const { address, name } = parseContract(GROUP_VAULT_CONTRACT);
  const { address: tokenAddr, name: tokenName } = parseContract(TOKEN_CONTRACT);
  const tx = await makeContractCall({
    contractAddress: address,
    contractName: name,
    functionName: "group-emergency-withdraw",
    functionArgs: [
      contractPrincipalCV(tokenAddr, tokenName),
      bufferCV(vaultId),
      uintCV(amount),
      stringAsciiCV(reason),
      bufferCV(signature),
    ],
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    postConditions: [],
  });
  const signed = await signTransaction(tx);
  return broadcastTransaction(signed, network);
}

// ─── Read-only helpers (call via Stacks API, no wallet needed) ───────────────

const apiBase =
  networkName === "mainnet"
    ? "https://api.hiro.so"
    : networkName === "devnet"
    ? "http://localhost:3999"
    : "https://api.testnet.hiro.so";

async function callReadOnly(
  contract: string,
  fnName: string,
  args: string[] = [],
  sender?: string
) {
  const { address, name } = parseContract(contract);
  const senderAddress = sender ?? address;
  const res = await fetch(
    `${apiBase}/v2/contracts/call-read/${address}/${name}/${fnName}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender: senderAddress, arguments: args }),
    }
  );
  if (!res.ok) throw new Error(`Read-only call failed: ${fnName}`);
  return res.json();
}

const cvHex = (cv: Parameters<typeof serializeCV>[0]) =>
  `0x${Buffer.from(serializeCV(cv)).toString("hex")}`;

export async function getVault(userAddress: string) {
  return callReadOnly(VAULT_CONTRACT, "get-vault", [
    cvHex(principalCV(userAddress)),
  ]);
}

export async function getPendingYield(userAddress: string) {
  return callReadOnly(VAULT_CONTRACT, "get-pending-yield", [
    cvHex(principalCV(userAddress)),
  ]);
}

export async function getGroupVault(vaultId: Uint8Array) {
  return callReadOnly(GROUP_VAULT_CONTRACT, "get-vault", [
    cvHex(bufferCV(vaultId)),
  ]);
}

export async function getMemberBalance(vaultId: Uint8Array, member: string) {
  return callReadOnly(GROUP_VAULT_CONTRACT, "get-member-balance", [
    cvHex(bufferCV(vaultId)),
    cvHex(principalCV(member)),
  ]);
}
