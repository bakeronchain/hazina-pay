# HazinaVault

**Forced savings for gig workers across Africa — powered by AI and Stellar.**

> "Hazina" means *treasure* in Swahili.

HazinaVault helps informal earners build savings discipline by locking USDC on Stellar/Soroban for 1–12 months, earning yield, and accessing funds in a genuine emergency — reviewed instantly by Claude AI.

---

## What It Does

| Feature | Description |
|---|---|
| **Forced Savings** | Lock USDC for 1–12 months. Remove the temptation to spend. |
| **Earn Yield** | 6% APY default, ledger-based compounding on Soroban. |
| **AI Emergency Review** | Claude vision evaluates photo evidence in seconds. Approves with ≥ 75% confidence. |
| **Ed25519 Signatures** | AI relayer signs approvals; Soroban contract verifies on-chain. |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                             │
│              Next.js 15 · TypeScript · Tailwind             │
│                                                             │
│  /              Landing page (Freighter connect)            │
│  /stellar-vault Stellar vault dashboard                     │
│  /emergency     AI-reviewed emergency withdrawal            │
└────────────────────┬────────────────────────────────────────┘
                     │ Next.js API routes
┌────────────────────▼────────────────────────────────────────┐
│                        Backend                              │
│                                                             │
│  POST /api/review-emergency  Claude vision + Ed25519 sign   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Stellar Soroban   │
                    │   Testnet/Mainnet   │
                    │                    │
                    │  HazinaVault.rs    │
                    │  (Rust contract)   │
                    └────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS |
| **Blockchain** | Stellar / Soroban (Rust smart contract) |
| **Wallet** | Freighter (Stellar) |
| **Token** | USDC on Stellar |
| **AI** | Anthropic Claude (`claude-sonnet-4-6`) — vision review |
| **Signing** | Ed25519 (Node.js crypto, verified on-chain by Soroban) |

---

## Project Structure

```
hazina-pay/
├── app/
│   ├── page.tsx                  # Landing page (Freighter connect)
│   ├── stellar-vault/page.tsx    # Vault dashboard — deposit, withdraw, emergency
│   └── api/
│       └── review-emergency/     # Claude vision review + Ed25519 signing
│
├── contracts/
│   └── stellar/
│       ├── Cargo.toml
│       └── src/lib.rs            # Soroban vault contract (Rust)
│
├── lib/
│   ├── stellar.ts                # Stellar SDK + Freighter integration
│   └── composer.ts               # LI.FI Composer API client
│
├── backend/                      # Standalone Express server (mirrors API routes)
│   └── src/routes/reviewEmergency.ts
│
├── .env.local.example
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- [Rust + cargo](https://rustup.rs/) — Soroban contract
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli) — deploy
- [Freighter](https://www.freighter.app/) — Stellar wallet

### 1. Clone and install

```bash
git clone https://github.com/bakeronchain/hazina-pay.git
cd hazina-pay
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
# Stellar
NEXT_PUBLIC_STELLAR_VAULT_CONTRACT=C...your-soroban-contract-id
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_USDC_CONTRACT=CBIELTK6YBZJU5UP2WWQEQPMKJGKQKZM2AMLMRKNRKMFNZOUIJ7DKJNL

# AI
ANTHROPIC_API_KEY=sk-ant-...
# 32-byte Ed25519 seed hex — must match the relayer address in the contract
AI_RELAYER_PRIVATE_KEY=your-64-char-hex-ed25519-seed
```

### 3. Run

```bash
npm run dev
# http://localhost:3000
```

---

## Smart Contract (Soroban / Rust)

File: `contracts/stellar/src/lib.rs`

```bash
cd contracts/stellar
stellar contract build

stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/hazina_vault_stellar.wasm \
  --network testnet \
  --source your-account

stellar contract invoke \
  --id <CONTRACT_ID> --network testnet --source your-account \
  -- initialize \
  --admin <G_ADDRESS> --relayer <RELAYER_G_ADDRESS> --token <USDC_ID>
```

Key functions:

```rust
initialize(admin, relayer, token)
deposit(from, amount, lock_months)   // lock 1–12 months
withdraw(to)                          // after lock expires
emergency_withdraw(to, amount, reason, signature)  // AI-approved only
get_vault(user) → Option<VaultData>
get_pending_yield(user) → i128
get_apy_bps() → i128                 // default 600 = 6%
```

---

## AI Emergency Review Flow

```
1. User submits photo + description + amount
2. Claude vision scores confidence 0–100
3. If confidence ≥ 75% → AI relayer signs with Ed25519
4. Signature submitted on-chain → Soroban verifies with ed25519_verify
5. Funds released immediately; yield forfeited
6. Max 3 lifetime emergencies per user
```

**Message hash** (mirrors `build_msg_hash` in the Soroban contract):
```
sha256(amount_le16 ‖ reason_xdr)
```
where `reason_xdr` = 4-byte BE length + UTF-8 bytes.

---

## Yield Mechanics

| Time Unit | Ledgers/year | Formula |
|---|---|---|
| ~5 sec / ledger | 6,220,800 | `balance × apy_bps × elapsed / (10_000 × 6_220_800)` |

Default APY: **600 bps = 6%**. Max: 2000 bps = 20%.

---

## Deployment

### Vercel (frontend + API)

```bash
vercel deploy
```

Set in Vercel dashboard:
- `NEXT_PUBLIC_STELLAR_VAULT_CONTRACT`
- `NEXT_PUBLIC_STELLAR_NETWORK`
- `NEXT_PUBLIC_STELLAR_USDC_CONTRACT`
- `ANTHROPIC_API_KEY`
- `AI_RELAYER_PRIVATE_KEY`

---

## License

MIT · April 2026
