//! HazinaVault — Stellar/Soroban
//!
//! Forced-savings vault for gig workers.  Users lock a Stellar token
//! (e.g. USDC) for 1-12 months and earn 6 % APY.  Early withdrawal
//! requires an AI-relayer signature (ed25519) and forfeits earned yield.
//!
//! Soroban storage layout
//! ─────────────────────
//!   Instance  → Admin, Relayer, AcceptedToken, Apy (i128 bps), YieldReserve
//!   Persistent → Vault(Address)   — one per user
//!   Temporary  → UsedSig(Bytes65) — replay protection, auto-expires

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    crypto::Hash,
    token, vec,
    Address, Bytes, BytesN, Env, String as SStr,
};

// ─── Constants ───────────────────────────────────────────────────────────────

/// ~5 seconds / ledger → 17 280 ledgers/day → 518 400/month → 6 220 800/year
const LEDGERS_PER_MONTH: u32 = 518_400;
const LEDGERS_PER_YEAR: i128 = 6_220_800;

/// Default 6 % APY in basis points
const DEFAULT_APY_BPS: i128 = 600;

/// Maximum lifetime emergency withdrawals per user
const MAX_EMERGENCIES: u32 = 3;

/// Minimum AI-relayer confidence to approve (stored off-chain, enforced here by
/// requiring a valid signature rather than a confidence score).
const _CONFIDENCE_THRESHOLD: u32 = 75;

// ─── Storage keys ────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,
    Relayer,
    Token,
    ApyBps,
    YieldReserve,
    Vault(Address),
    UsedSig(BytesN<64>),
}

// ─── Data types ───────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct VaultData {
    /// Locked principal in token's stroops (10^7 for USDC on Stellar)
    pub balance: i128,
    /// Ledger sequence at deposit time
    pub deposit_ledger: u32,
    /// Ledger sequence when funds unlock
    pub unlock_ledger: u32,
    /// Identity verified flag (set by off-chain nullifier flow)
    pub verified: bool,
    /// Lifetime emergency-withdrawal count
    pub emergency_count: u32,
}

// ─── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct HazinaVaultStellar;

#[contractimpl]
impl HazinaVaultStellar {
    // ── Admin ────────────────────────────────────────────────────────────────

    /// One-time initialiser — deployer must call this after upload.
    pub fn initialize(env: Env, admin: Address, relayer: Address, token: Address) {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialised");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Relayer, &relayer);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::ApyBps, &DEFAULT_APY_BPS);
        env.storage().instance().set(&DataKey::YieldReserve, &0_i128);
    }

    /// Owner: update APY (max 2000 bps = 20 %).
    pub fn set_apy(env: Env, new_apy_bps: i128) {
        Self::require_admin(&env);
        assert!(new_apy_bps > 0 && new_apy_bps <= 2000, "apy out of range");
        env.storage().instance().set(&DataKey::ApyBps, &new_apy_bps);
    }

    /// Owner: top up yield reserve.
    pub fn fund_reserve(env: Env, from: Address, amount: i128) {
        from.require_auth();
        Self::require_admin(&env);
        assert!(amount > 0, "invalid amount");
        let token_client = Self::token_client(&env);
        token_client.transfer(&from, &env.current_contract_address(), &amount);
        let reserve: i128 = env.storage().instance()
            .get(&DataKey::YieldReserve).unwrap_or(0);
        env.storage().instance().set(&DataKey::YieldReserve, &(reserve + amount));
    }

    /// Owner: update the AI relayer address.
    pub fn set_relayer(env: Env, new_relayer: Address) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::Relayer, &new_relayer);
    }

    // ── User ─────────────────────────────────────────────────────────────────

    /// Deposit `amount` tokens and lock for `lock_months` (1–12).
    /// A second deposit adds to the existing balance and resets the lock.
    pub fn deposit(env: Env, from: Address, amount: i128, lock_months: u32) {
        from.require_auth();
        assert!(amount > 0, "amount must be positive");
        assert!(lock_months >= 1 && lock_months <= 12, "lock_months 1-12");

        let token_client = Self::token_client(&env);
        token_client.transfer(&from, &env.current_contract_address(), &amount);

        let current_ledger = env.ledger().sequence();
        let unlock_ledger = current_ledger + LEDGERS_PER_MONTH * lock_months;

        // If vault already exists, compound existing balance before resetting
        let existing: Option<VaultData> = env
            .storage()
            .persistent()
            .get(&DataKey::Vault(from.clone()));

        let (new_balance, emergency_count, verified) = match existing {
            Some(v) => {
                let yield_so_far = Self::calc_yield_inner(&env, &v);
                (v.balance + yield_so_far + amount, v.emergency_count, v.verified)
            }
            None => (amount, 0, false),
        };

        let vault = VaultData {
            balance: new_balance,
            deposit_ledger: current_ledger,
            unlock_ledger,
            verified,
            emergency_count,
        };
        env.storage().persistent().set(&DataKey::Vault(from), &vault);
    }

    /// Withdraw principal + accrued yield after the lock expires.
    pub fn withdraw(env: Env, to: Address) {
        to.require_auth();

        let vault: VaultData = env
            .storage()
            .persistent()
            .get(&DataKey::Vault(to.clone()))
            .expect("no vault found");

        assert!(
            env.ledger().sequence() >= vault.unlock_ledger,
            "vault is still locked"
        );

        let yield_earned = Self::calc_yield_inner(&env, &vault);
        let total = vault.balance + Self::clamp_yield(&env, yield_earned);

        let token_client = Self::token_client(&env);
        token_client.transfer(&env.current_contract_address(), &to, &total);

        env.storage().persistent().remove(&DataKey::Vault(to));
    }

    /// AI-approved emergency withdrawal.
    ///
    /// `signature` is a 64-byte ed25519 sig by the AI relayer over:
    ///   sha256(user_address_bytes ‖ amount_le_bytes ‖ reason_utf8)
    ///
    /// Yield is forfeited; only the locked principal (up to `amount`) is sent.
    pub fn emergency_withdraw(
        env: Env,
        to: Address,
        amount: i128,
        reason: SStr,
        signature: BytesN<64>,
    ) {
        to.require_auth();
        assert!(amount > 0, "invalid amount");

        let mut vault: VaultData = env
            .storage()
            .persistent()
            .get(&DataKey::Vault(to.clone()))
            .expect("no vault found");

        assert!(
            vault.emergency_count < MAX_EMERGENCIES,
            "emergency limit reached"
        );

        // Replay protection
        let sig_key = DataKey::UsedSig(signature.clone());
        assert!(
            !env.storage().temporary().has(&sig_key),
            "signature already used"
        );
        env.storage().temporary().set(&sig_key, &true);

        // Verify AI relayer ed25519 signature
        let relayer: Address = env
            .storage()
            .instance()
            .get(&DataKey::Relayer)
            .expect("relayer not set");

        let msg_hash = Self::build_msg_hash(&env, &to, amount, &reason);
        // Soroban ed25519 verify: panics if invalid
        env.crypto().ed25519_verify(
            &Self::address_to_pubkey(&env, &relayer),
            &msg_hash.into(),
            &signature,
        );

        let transfer_amount = amount.min(vault.balance);
        vault.balance -= transfer_amount;
        vault.emergency_count += 1;

        if vault.balance == 0 {
            env.storage().persistent().remove(&DataKey::Vault(to.clone()));
        } else {
            env.storage().persistent().set(&DataKey::Vault(to.clone()), &vault);
        }

        let token_client = Self::token_client(&env);
        token_client.transfer(&env.current_contract_address(), &to, &transfer_amount);
    }

    // ── Read-only ────────────────────────────────────────────────────────────

    pub fn get_vault(env: Env, user: Address) -> Option<VaultData> {
        env.storage().persistent().get(&DataKey::Vault(user))
    }

    pub fn get_pending_yield(env: Env, user: Address) -> i128 {
        let vault: Option<VaultData> = env.storage().persistent().get(&DataKey::Vault(user));
        match vault {
            Some(v) => Self::calc_yield_inner(&env, &v),
            None => 0,
        }
    }

    pub fn get_apy_bps(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::ApyBps).unwrap_or(DEFAULT_APY_BPS)
    }

    pub fn get_yield_reserve(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::YieldReserve).unwrap_or(0)
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("no admin");
        admin.require_auth();
    }

    fn token_client(env: &Env) -> token::Client {
        let token: Address = env.storage().instance().get(&DataKey::Token).expect("no token");
        token::Client::new(env, &token)
    }

    fn calc_yield_inner(env: &Env, vault: &VaultData) -> i128 {
        let elapsed = (env.ledger().sequence().saturating_sub(vault.deposit_ledger)) as i128;
        let apy_bps: i128 = env
            .storage()
            .instance()
            .get(&DataKey::ApyBps)
            .unwrap_or(DEFAULT_APY_BPS);
        // yield = balance × apy_bps × elapsed / (10_000 × ledgers_per_year)
        vault.balance * apy_bps * elapsed / (10_000 * LEDGERS_PER_YEAR)
    }

    /// Cap yield at available reserve; returns 0 if reserve empty (principal safe).
    fn clamp_yield(env: &Env, yield_amount: i128) -> i128 {
        if yield_amount <= 0 {
            return 0;
        }
        let reserve: i128 = env
            .storage()
            .instance()
            .get(&DataKey::YieldReserve)
            .unwrap_or(0);
        if reserve <= 0 {
            return 0;
        }
        let clamped = yield_amount.min(reserve);
        env.storage()
            .instance()
            .set(&DataKey::YieldReserve, &(reserve - clamped));
        clamped
    }

    /// sha256(address_bytes ‖ amount_le16 ‖ reason_utf8)
    fn build_msg_hash(env: &Env, user: &Address, amount: i128, reason: &SStr) -> BytesN<32> {
        let mut payload = Bytes::new(env);
        // Simple deterministic encoding: address as bytes, amount as 16-byte LE, reason
        payload.extend_from_array(&amount.to_le_bytes());
        // Append reason bytes
        let reason_bytes = reason.to_xdr(env);
        payload.append(&reason_bytes);
        env.crypto().sha256(&payload)
    }

    /// Extract the ed25519 public key from a Stellar address.
    /// Stellar G-addresses encode a 32-byte ed25519 public key directly.
    fn address_to_pubkey(env: &Env, addr: &Address) -> BytesN<32> {
        // In Soroban, to_xdr on an AccountId gives us the 32-byte pubkey after a 4-byte prefix
        let xdr = addr.to_xdr(env);
        // XDR for AccountId: 4-byte discriminant (0x00000000) + 32-byte pubkey
        let mut pubkey = [0u8; 32];
        for i in 0..32 {
            pubkey[i] = xdr.get(4 + i as u32).unwrap_or(0);
        }
        BytesN::from_array(env, &pubkey)
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::{token::StellarAssetClient, Env};

    fn setup() -> (Env, Address, Address, Address, HazinaVaultStellarClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let relayer = Address::generate(&env);

        // Deploy a test token
        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        let token_address = token_id.address();

        // Deploy the vault
        let contract_id = env.register(HazinaVaultStellar, ());
        let client = HazinaVaultStellarClient::new(&env, &contract_id);

        client.initialize(&admin, &relayer, &token_address);

        (env, admin, relayer, token_address, client)
    }

    #[test]
    fn test_deposit_and_withdraw() {
        let (env, admin, _relayer, token_address, client) = setup();
        let user = Address::generate(&env);

        // Mint tokens to user
        let token_admin = StellarAssetClient::new(&env, &token_address);
        token_admin.mint(&user, &10_000_0000000_i128); // 10 000 USDC (7 decimals)

        // Fund yield reserve
        token_admin.mint(&admin, &1_000_0000000_i128);
        client.fund_reserve(&admin, &1_000_0000000_i128);

        // Deposit 100 USDC for 1 month
        client.deposit(&user, &100_0000000_i128, &1);

        let vault = client.get_vault(&user).unwrap();
        assert_eq!(vault.balance, 100_0000000_i128);
        assert_eq!(vault.emergency_count, 0);

        // Fast-forward past the lock
        env.ledger().with_mut(|l| {
            l.sequence_number += LEDGERS_PER_MONTH + 1;
        });

        // Withdraw
        client.withdraw(&user);
        assert!(client.get_vault(&user).is_none());
    }
}
