# HazinaVault

**Forced savings for gig workers across Africa — powered by AI, Stellar, and LI.FI.**

> "Hazina" means *treasure* in Swahili.

HazinaVault helps informal earners build savings discipline by locking stablecoins for 1–12 months, earning yield, and accessing funds in a genuine emergency — reviewed instantly by Claude AI.

---

## What It Does

| Feature | Description |
|---|---|
| **Forced Savings** | Lock USDC/USDA for 1–12 months. Remove the temptation to spend. |
| **Earn Yield** | 6% APY default, block/ledger-based compounding. |
| **AI Emergency Review** | Claude vision evaluates photo evidence in seconds. Approves with ≥ 75% confidence. |
| **Group Vaults** | Up to 20 members save together with independent balances. |
| **LI.FI Yield Discovery** | Compare APY across 20+ DeFi protocols on 21 chains. Deposit in one click. |
| **AI Yield Advisor** | Natural language: *"put my USDC into the safest vault above 5% on Arbitrum"* — Claude finds and routes the deposit. |
| **Dual Chain** | Runs on **Stacks** and **Stellar** (Soroban). |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                             │
│              Next.js 15 · TypeScript · Tailwind             │
│                                                             │
│  /              Landing page                                │
│  /dashboard     Stacks vault dashboard                      │
│  /stellar-vault Stellar vault (Freighter wallet)            │
│  /earn          LI.FI yield discovery + AI advisor          │
│  /group         Group vaults                                │
│  /emergency     AI-reviewed emergency withdrawal            │
└────────────────────┬────────────────────────────────────────┘
                     │ API routes (Next.js) or
                     │ standalone backend (Express)
┌────────────────────▼────────────────────────────────────────┐
│                        Backend                              │
│                                                             │
│  POST /api/review-emergency  Claude vision + Stacks sign    │
│  GET  /api/earn-vaults       LI.FI Earn Data API proxy      │
│  POST /api/earn-agent        Claude AI yield advisor        │
│  GET  /api/earn-quote        LI.FI Composer API proxy       │
└──────┬───────────────────────────────┬───────────────────────┘
       │                               │
┌──────▼──────┐                ┌───────▼────────┐
│   Stacks    │                │   LI.FI APIs   │
│  Testnet /  │                │                │
│  Mainnet    │                │ earn.li.fi     │
│             │                │ li.quest       │
│ HazinaVault │                └────────────────┘
│ HazinaGroup │
│ Vault.clar  │
└──────┬──────┘
       │
┌──────▼──────┐
│   Stellar   │
│  Testnet /  │
│  Mainnet    │
│             │
│ HazinaVault │
│ Stellar.rs  │
│ (Soroban)   │
└─────────────┘
```

---

## Tech Stack

### Frontend
- **Next.js 15** (App Router, React 19)
- **TypeScript**
- **Tailwind CSS** with custom gold palette
- **TanStack React Query** — vault data caching & polling

### Blockchains
| Chain | Language | Wallet | Token |
|---|---|---|---|
| **Stacks** | Clarity 2 | Hiro / Leather | USDA (SIP-010) |
| **Stellar** (Soroban) | Rust | Freighter | USDC |

### AI
- **Anthropic Claude** (`claude-sonnet-4-6`) — vision-based emergency review + yield advisor
- Ed25519 / secp256k1 on-chain signature verification

### DeFi Integration
- **LI.FI Earn Data API** (`earn.li.fi`) — vault discovery, APY, TVL across 21 chains
- **LI.FI Composer API** (`li.quest`) — one-click cross-chain deposits into any vault

### Backend
- **Express 4** — standalone API server mirroring all Next.js API routes
- **Multer** — multipart image uploads for emergency review

---

## Project Structure

```
hazina-pay/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Landing page
│   ├── dashboard/page.tsx        # Stacks vault dashboard
│   ├── stellar-vault/page.tsx    # Stellar vault (Freighter)
│   ├── earn/page.tsx             # LI.FI yield discovery + AI chat
│   ├── create-vault/page.tsx     # Deposit & lock
│   ├── withdraw/page.tsx         # Normal withdrawal
│   ├── emergency/page.tsx        # AI-reviewed emergency withdrawal
│   ├── group/page.tsx            # Group vault UI
│   ├── verify/page.tsx           # Identity verification
│   └── api/
│       ├── review-emergency/     # Claude vision review + secp256k1 signing
│       ├── earn-vaults/          # LI.FI Earn Data API proxy
│       ├── earn-agent/           # Claude AI yield advisor
│       └── earn-quote/           # LI.FI Composer proxy
│
├── backend/                      # Standalone Express API server
│   ├── src/
│   │   ├── index.ts              # Express entry point (port 4000)
│   │   ├── routes/
│   │   │   ├── reviewEmergency.ts
│   │   │   ├── earnVaults.ts
│   │   │   ├── earnAgent.ts
│   │   │   └── earnQuote.ts
│   │   └── lib/
│   │       └── lifi.ts
│   ├── package.json
│   └── .env.example
│
├── contracts/
│   ├── HazinaVault.clar          # Stacks individual vault (Clarity 2)
│   ├── HazinaGroupVault.clar     # Stacks group vault (Clarity 2)
│   ├── mock-usda.clar            # Testnet USDA faucet token
│   └── stellar/
│       ├── Cargo.toml            # Rust project config
│       └── src/lib.rs            # Stellar Soroban vault contract (Rust)
│
├── lib/
│   ├── hooks.ts                  # React Query hooks for Stacks data
│   ├── stacks.ts                 # Stacks contract call builders
│   ├── wallet.ts                 # Stacks wallet session
│   ├── lifi.ts                   # LI.FI Earn Data API client
│   ├── composer.ts               # LI.FI Composer API client
│   └── stellar.ts                # Stellar SDK + Freighter integration
│
├── components/
│   ├── GoldButton.tsx
│   ├── VaultCard.tsx
│   ├── ProgressBar.tsx
│   ├── StatusBadge.tsx
│   └── Providers.tsx
│
├── .env.local.example
├── Clarinet.toml
├── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- [Clarinet](https://docs.hiro.so/clarinet/getting-started) — Stacks contract dev
- [Rust + cargo](https://rustup.rs/) — Stellar Soroban contract
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli) — Soroban deploy
- [Hiro Wallet](https://wallet.hiro.so/) or [Leather](https://leather.io/) — Stacks
- [Freighter](https://www.freighter.app/) — Stellar

### 1. Clone and install

```bash
git clone https://github.com/your-username/hazina-pay.git
cd hazina-pay
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
# Stacks
NEXT_PUBLIC_VAULT_CONTRACT=SP000000000000000000002Q6VF78.HazinaVault
NEXT_PUBLIC_GROUP_VAULT_CONTRACT=SP000000000000000000002Q6VF78.HazinaGroupVault
NEXT_PUBLIC_TOKEN_CONTRACT=SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token
NEXT_PUBLIC_STACKS_NETWORK=testnet

# Stellar
NEXT_PUBLIC_STELLAR_VAULT_CONTRACT=C...your-soroban-contract-id
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_USDC_CONTRACT=CBIELTK6YBZJU5UP2WWQEQPMKJGKQKZM2AMLMRKNRKMFNZOUIJ7DKJNL

# AI
ANTHROPIC_API_KEY=sk-ant-...
AI_RELAYER_PRIVATE_KEY=your-64-char-hex-stacks-private-key

# LI.FI — get key at https://portal.li.fi
LIFI_API_KEY=your-lifi-api-key
```

### 3. Run the frontend

```bash
npm run dev
# http://localhost:3000
```

### 4. Run the backend (standalone, optional)

```bash
cd backend
npm install
cp .env.example .env   # fill in your keys
npm run dev            # http://localhost:4000
```

---

## Smart Contracts

### Stacks (Clarity 2)

| Contract | File | Network |
|---|---|---|
| `HazinaVault` | `contracts/HazinaVault.clar` | Stacks testnet/mainnet |
| `HazinaGroupVault` | `contracts/HazinaGroupVault.clar` | Stacks testnet/mainnet |
| `mock-usda` | `contracts/mock-usda.clar` | Testnet only |

```bash
clarinet check           # validate
clarinet test            # run tests
clarinet deployments apply --testnet
```

Key functions:
```clarity
(deposit token amount lock-months)
(withdraw token)
(emergency-withdraw token amount reason signature)
(get-vault user)
(get-pending-yield user)
```

### Stellar (Soroban / Rust)

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
deposit(from, amount, lock_months)
withdraw(to)
emergency_withdraw(to, amount, reason, signature)
get_vault(user) → Option<VaultData>
get_pending_yield(user) → i128
get_apy_bps() → i128
```

---

## API Reference

### `POST /api/review-emergency`

| Field | Type | Notes |
|---|---|---|
| `image` | File (multipart) | Photo evidence |
| `description` | string | Max 1000 chars |
| `userAddress` | string | Wallet address |
| `amount` | string | Micro-units |

```json
// Approved
{ "approved": true, "signature": "0x...", "message": "Medical bill verified" }

// Rejected
{ "approved": false, "message": "Evidence does not match description" }
```

### `GET /api/earn-vaults`

| Param | Description |
|---|---|
| `tokens` | `USDC,USDT` |
| `chains` | `42161,8453` |
| `minApy` | `5` (percent) |
| `limit` | Default 50 |
| `search` | Text search |

> APY is decimal (`0.087` = 8.7%). TVL `usd` is a string.

### `POST /api/earn-agent`

```json
// Request
{ "message": "safest USDC vault above 5% on Arbitrum", "walletAddress": "0x..." }

// Response
{ "message": "I recommend...", "recommendedVault": { "address": "0x...", "apy": "8.70%", ... }, "vaults": [...] }
```

### `GET /api/earn-quote`

| Param | Notes |
|---|---|
| `fromChain` | Source chain ID |
| `toChain` | Vault's chain ID |
| `fromToken` | e.g. `USDC` |
| `toToken` | **Vault address** — NOT the underlying token |
| `fromAddress` | Sender EVM address |
| `toAddress` | Recipient (usually same) |
| `fromAmount` | Smallest unit e.g. `1000000` |

---

## LI.FI Integration

```
Earn Data API  https://earn.li.fi   — no auth required
Composer API   https://li.quest     — requires LIFI_API_KEY from portal.li.fi
```

Integration flow:
```
1. GET /api/earn-vaults  →  earn.li.fi/v1/earn/vaults   (discover)
2. User selects vault
3. GET /api/earn-quote   →  li.quest/v1/quote            (toToken = vault address)
4. User signs transactionRequest in wallet
5. Transaction broadcast
```

> **Critical:** `toToken` in the Composer quote must be the **vault contract address**, not the underlying asset address.

---

## Emergency Withdrawal Flow

```
1. User submits photo + description + amount
2. Claude vision scores confidence 0–100
3. If confidence ≥ 75% → AI relayer signs approval
4. Signature submitted on-chain → funds released immediately
5. Yield forfeited; max 3 lifetime emergencies per user
```

---

## Yield Mechanics

| Chain | Time Unit | Blocks/year | Formula |
|---|---|---|---|
| Stacks | ~10 min blocks | 52,560 | `balance × apy_bps × elapsed / (10_000 × 52_560)` |
| Stellar | Ledger sequences (~5 sec) | 6,220,800 | `balance × apy_bps × elapsed / (10_000 × 6_220_800)` |

Default APY: **600 bps = 6%**. Max: 2000 bps = 20%.

---

## Hackathon

**DeFi Mullet Hackathon #1** · LI.FI · April 8–14, 2026

**Track: AI × Earn**

Both LI.FI APIs integrated:
- Earn Data API — vault discovery at `/earn`
- Composer API — one-click deposit via `/api/earn-quote`

**Submission:** April 14 · tweet `@lifiprotocol @kenny_io` · form at `forms.gle/1PCvD9BymH1EyRmV8`

---

## Deployment

### Vercel (frontend)
```bash
vercel deploy
```
Add all env vars in the Vercel dashboard.

### Railway / Render (backend)
```bash
cd backend && npm run build && npm start
```
Set `PORT`, `ANTHROPIC_API_KEY`, `AI_RELAYER_PRIVATE_KEY`, `LIFI_API_KEY`, `ALLOWED_ORIGIN`.

---

## License

MIT · Built for DeFi Mullet Hackathon #1 · April 2026
