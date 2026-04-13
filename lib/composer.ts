/**
 * lib/composer.ts
 *
 * Client for the LI.FI Composer API (https://li.quest)
 * Requires an API key from https://portal.li.fi
 *
 * The Composer orchestrates multi-step DeFi flows:
 *   swap → bridge → deposit into vault
 * in a single executable transaction.
 *
 * API docs: https://docs.li.fi/composer/overview
 */

const COMPOSER_API = "https://li.quest";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ComposerQuoteParams {
  /** Source chain (chain ID or key e.g. "ARB", "ETH") */
  fromChain: string | number;
  /** Destination chain (chain ID or key) */
  toChain: string | number;
  /** Source token symbol or address (e.g. "USDC") */
  fromToken: string;
  /**
   * Destination token = VAULT ADDRESS (not underlying token).
   * This is what tells the Composer to deposit into the vault.
   */
  toToken: string;
  /** Sender's EVM wallet address */
  fromAddress: string;
  /** Recipient address (usually same as fromAddress for self-deposit) */
  toAddress: string;
  /** Amount in token's smallest unit (e.g. 1000000 for 1 USDC with 6 decimals) */
  fromAmount: string;
}

export interface ComposerTokenInfo {
  symbol: string;
  decimals: number;
  address: string;
  chainId: number;
  name: string;
  logoURI?: string;
}

export interface ComposerGasCost {
  amount: string;
  amountUSD: string;
  token: ComposerTokenInfo;
}

export interface ComposerEstimate {
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  approvalAddress: string;
  executionDuration: number; // seconds
  gasCosts: ComposerGasCost[];
  feeCosts?: Array<{ amount: string; amountUSD: string; description: string }>;
}

export interface ComposerTransactionRequest {
  from: string;
  to: string;
  data: string;
  value: string;
  gasLimit: string;
  gasPrice: string;
  chainId: number;
}

export interface ComposerQuote {
  id: string;
  type: string;
  tool: string;
  toolDetails: {
    key: string;
    name: string;
    logoURI: string;
  };
  action: {
    fromChainId: number;
    toChainId: number;
    fromToken: ComposerTokenInfo;
    toToken: ComposerTokenInfo;
    fromAmount: string;
    slippage: number;
  };
  estimate: ComposerEstimate;
  /** Ready-to-sign EVM transaction. Present when fromAddress is provided. */
  transactionRequest?: ComposerTransactionRequest;
  includedSteps: ComposerQuote[];
}

// ─── API client ─────────────────────────────────────────────────────────────

/**
 * Get a deposit quote from the Composer API.
 * IMPORTANT: `toToken` must be the vault contract address, NOT the underlying asset.
 *
 * This is a GET request — do NOT convert to POST.
 */
export async function getDepositQuote(
  params: ComposerQuoteParams,
  apiKey: string
): Promise<ComposerQuote> {
  const url = new URL(`${COMPOSER_API}/v1/quote`);

  // Attach all params as query strings
  (Object.entries(params) as [string, string | number][]).forEach(([k, v]) =>
    url.searchParams.set(k, String(v))
  );

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-lifi-api-key": apiKey,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Composer API ${res.status}: ${body}`);
  }

  return res.json();
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

/** Format execution duration in human-readable form */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `~${seconds}s`;
  const mins = Math.round(seconds / 60);
  return `~${mins}m`;
}

/** Format gas cost USD */
export function formatGasUSD(gasCosts: ComposerGasCost[]): string {
  const total = gasCosts.reduce(
    (sum, g) => sum + parseFloat(g.amountUSD || "0"),
    0
  );
  return total < 0.01 ? "<$0.01" : `$${total.toFixed(2)}`;
}
