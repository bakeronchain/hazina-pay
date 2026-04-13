/**
 * lib/stellar.ts
 *
 * Stellar / Soroban integration for HazinaVault.
 *
 * Covers:
 *   - Network setup  (testnet / mainnet)
 *   - Freighter wallet connect / disconnect / address
 *   - Contract read-only calls  (get_vault, get_pending_yield, get_apy_bps)
 *   - Transaction builders       (deposit, withdraw, emergency_withdraw)
 *   - Signing via Freighter and broadcast via Soroban RPC
 *
 * Contract docs: contracts/stellar/src/lib.rs
 * Stellar SDK:   https://stellar.github.io/js-stellar-sdk/
 * Freighter API: https://docs.freighter.app/
 */

import {
  Contract,
  Networks,
  rpc as SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

// ─── Network config ──────────────────────────────────────────────────────────

const NETWORK_NAME =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK as "testnet" | "mainnet") ??
  "testnet";

export const STELLAR_NETWORK = NETWORK_NAME;

export const STELLAR_RPC_URL =
  NETWORK_NAME === "mainnet"
    ? "https://mainnet.stellar.validationcloud.io/v1/soroban"
    : "https://soroban-testnet.stellar.org";

export const STELLAR_PASSPHRASE =
  NETWORK_NAME === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

/**
 * USDC on Stellar
 * Testnet:  contract issued by Circle test deployer
 * Mainnet:  CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75
 */
export const STELLAR_USDC_CONTRACT =
  process.env.NEXT_PUBLIC_STELLAR_USDC_CONTRACT ??
  (NETWORK_NAME === "mainnet"
    ? "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75"
    : "CBIELTK6YBZJU5UP2WWQEQPMKJGKQKZM2AMLMRKNRKMFNZOUIJ7DKJNL"); // testnet USDC

export const STELLAR_VAULT_CONTRACT =
  process.env.NEXT_PUBLIC_STELLAR_VAULT_CONTRACT ?? "";

/** Stellar token decimals: 7 (1 USDC = 10_000_000 stroops) */
export const STELLAR_TOKEN_DECIMALS = 7;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StellarVaultData {
  balance: bigint;
  depositLedger: number;
  unlockLedger: number;
  verified: boolean;
  emergencyCount: number;
}

// ─── Freighter wallet helpers ─────────────────────────────────────────────────

/** Returns true if the Freighter extension is installed. */
export async function isFreighterInstalled(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { isConnected } = await import("@stellar/freighter-api");
    const result = await isConnected();
    return result.isConnected;
  } catch {
    return false;
  }
}

/** Request access and return the user's G-address, or null on rejection. */
export async function connectFreighter(): Promise<string | null> {
  try {
    const { requestAccess, getAddress } = await import("@stellar/freighter-api");
    const accessResult = await requestAccess();
    if (accessResult.error) return null;
    const addrResult = await getAddress();
    if (addrResult.error) return null;
    return addrResult.address;
  } catch {
    return null;
  }
}

/** Get the currently connected address without prompting. */
export async function getFreighterAddress(): Promise<string | null> {
  try {
    const { getAddress } = await import("@stellar/freighter-api");
    const result = await getAddress();
    if (result.error) return null;
    return result.address;
  } catch {
    return null;
  }
}

/** Sign a base64 XDR transaction string via Freighter. Returns signed XDR. */
export async function signWithFreighter(
  xdrTransaction: string,
  networkPassphrase: string
): Promise<string> {
  const { signTransaction } = await import("@stellar/freighter-api");
  const result = await signTransaction(xdrTransaction, {
    networkPassphrase,
  });
  if (result.error) throw new Error(result.error);
  return result.signedTxXdr;
}

// ─── RPC client ──────────────────────────────────────────────────────────────

function getRpc(): SorobanRpc.Server {
  return new SorobanRpc.Server(STELLAR_RPC_URL, { allowHttp: false });
}

// ─── Read-only contract calls ────────────────────────────────────────────────

/**
 * Fetch vault data for a Stellar address.
 * Returns null if no vault exists.
 */
export async function getStellarVault(
  userAddress: string
): Promise<StellarVaultData | null> {
  if (!STELLAR_VAULT_CONTRACT) return null;

  const rpc = getRpc();
  const contract = new Contract(STELLAR_VAULT_CONTRACT);

  // Build a simulated transaction to call get_vault(user)
  const account = await rpc.getAccount(userAddress).catch(() => null);
  if (!account) return null;

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "get_vault",
        nativeToScVal(userAddress, { type: "address" })
      )
    )
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) return null;
  if (!sim.result) return null;

  const raw = scValToNative(sim.result.retval);
  if (!raw) return null;

  return {
    balance: BigInt(raw.balance ?? 0),
    depositLedger: Number(raw.deposit_ledger ?? 0),
    unlockLedger: Number(raw.unlock_ledger ?? 0),
    verified: Boolean(raw.verified),
    emergencyCount: Number(raw.emergency_count ?? 0),
  };
}

/**
 * Get pending yield for a user (read-only).
 */
export async function getStellarPendingYield(
  userAddress: string
): Promise<bigint> {
  if (!STELLAR_VAULT_CONTRACT) return BigInt(0);

  const rpc = getRpc();
  const contract = new Contract(STELLAR_VAULT_CONTRACT);
  const account = await rpc.getAccount(userAddress).catch(() => null);
  if (!account) return BigInt(0);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "get_pending_yield",
        nativeToScVal(userAddress, { type: "address" })
      )
    )
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim) || !sim.result) return BigInt(0);
  return BigInt(scValToNative(sim.result.retval) ?? 0);
}

/**
 * Get current APY in basis points (600 = 6 %).
 * Pass the connected user address to query the live contract value;
 * falls back to the default 600 bps (6 %) when no address is available.
 */
export async function getStellarApyBps(userAddress?: string): Promise<number> {
  if (!STELLAR_VAULT_CONTRACT || !userAddress) return 600;

  try {
    const rpc = getRpc();
    const contract = new Contract(STELLAR_VAULT_CONTRACT);
    const account = await rpc.getAccount(userAddress);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: STELLAR_PASSPHRASE,
    })
      .addOperation(contract.call("get_apy_bps"))
      .setTimeout(30)
      .build();

    const sim = await rpc.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(sim) || !sim.result) return 600;
    return Number(scValToNative(sim.result.retval) ?? 600);
  } catch {
    return 600;
  }
}

// ─── Transaction builders ────────────────────────────────────────────────────

/**
 * Build, simulate, sign (Freighter) and submit a deposit transaction.
 *
 * @param from         Sender's G-address
 * @param amountUsdc   Human-readable amount (e.g. "100" for 100 USDC)
 * @param lockMonths   1–12
 */
export async function stellarDeposit(
  from: string,
  amountUsdc: string,
  lockMonths: number
): Promise<string> {
  const rpc = getRpc();
  const contract = new Contract(STELLAR_VAULT_CONTRACT);
  const account = await rpc.getAccount(from);

  const amountStroops = BigInt(
    Math.round(parseFloat(amountUsdc) * 10 ** STELLAR_TOKEN_DECIMALS)
  );

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "deposit",
        nativeToScVal(from, { type: "address" }),
        nativeToScVal(amountStroops, { type: "i128" }),
        nativeToScVal(lockMonths, { type: "u32" })
      )
    )
    .setTimeout(30)
    .build();

  return submitTx(rpc, tx);
}

/**
 * Build, simulate, sign and submit a normal withdrawal.
 */
export async function stellarWithdraw(from: string): Promise<string> {
  const rpc = getRpc();
  const contract = new Contract(STELLAR_VAULT_CONTRACT);
  const account = await rpc.getAccount(from);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_PASSPHRASE,
  })
    .addOperation(
      contract.call("withdraw", nativeToScVal(from, { type: "address" }))
    )
    .setTimeout(30)
    .build();

  return submitTx(rpc, tx);
}

/**
 * Build, simulate, sign and submit an emergency withdrawal.
 *
 * `signature` is the hex string returned by /api/review-emergency (64 bytes ed25519).
 */
export async function stellarEmergencyWithdraw(
  from: string,
  amountUsdc: string,
  reason: string,
  signatureHex: string
): Promise<string> {
  const rpc = getRpc();
  const contract = new Contract(STELLAR_VAULT_CONTRACT);
  const account = await rpc.getAccount(from);

  const amountStroops = BigInt(
    Math.round(parseFloat(amountUsdc) * 10 ** STELLAR_TOKEN_DECIMALS)
  );

  // Strip leading 0x if present
  const cleanSig = signatureHex.replace(/^0x/, "");
  const sigBytes = Buffer.from(cleanSig, "hex");

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "emergency_withdraw",
        nativeToScVal(from, { type: "address" }),
        nativeToScVal(amountStroops, { type: "i128" }),
        nativeToScVal(reason, { type: "string" }),
        xdr.ScVal.scvBytes(sigBytes)
      )
    )
    .setTimeout(30)
    .build();

  return submitTx(rpc, tx);
}

// ─── Internal submit helper ───────────────────────────────────────────────────

async function submitTx(
  rpc: SorobanRpc.Server,
  tx: ReturnType<TransactionBuilder["build"]>
): Promise<string> {
  // 1. Simulate to get resource fees
  const sim = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }

  // 2. Assemble transaction with resource data
  const assembled = SorobanRpc.assembleTransaction(tx, sim).build();

  // 3. Sign with Freighter
  const signedXdr = await signWithFreighter(
    assembled.toXDR(),
    STELLAR_PASSPHRASE
  );

  // 4. Broadcast
  const { TransactionBuilder: TB } = await import("@stellar/stellar-sdk");
  const signedTx = TB.fromXDR(signedXdr, STELLAR_PASSPHRASE);
  const result = await rpc.sendTransaction(signedTx);

  if (result.status === "ERROR") {
    throw new Error(`Broadcast failed: ${result.errorResult?.toXDR?.() ?? result.status}`);
  }

  // 5. Poll for confirmation
  const txHash = result.hash;
  let attempts = 0;
  while (attempts < 20) {
    await new Promise((r) => setTimeout(r, 3000));
    const status = await rpc.getTransaction(txHash);
    if (status.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      return txHash;
    }
    if (status.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed: ${txHash}`);
    }
    attempts++;
  }

  throw new Error(`Transaction timed out: ${txHash}`);
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Convert stroops (bigint) to human-readable USDC string */
export function stroopsToUsdc(stroops: bigint): string {
  const n = Number(stroops) / 10 ** STELLAR_TOKEN_DECIMALS;
  return n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

/** Convert human-readable USDC to stroops bigint */
export function usdcToStroops(usdc: string): bigint {
  return BigInt(Math.round(parseFloat(usdc) * 10 ** STELLAR_TOKEN_DECIMALS));
}

/**
 * Estimate unlock date from a ledger number.
 * Stellar averages ~5 seconds per ledger.
 */
export function ledgerToDate(targetLedger: number, currentLedger: number): Date {
  const secondsUntil = (targetLedger - currentLedger) * 5;
  return new Date(Date.now() + secondsUntil * 1000);
}
