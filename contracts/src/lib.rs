#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    token::Client as TokenClient,
    Address, Env, Map, String,
};

// ---------------------------------------------------------------------------
// Stream struct
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Stream {
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub total_amount: i128,
    pub claimed_amount: i128,
    pub start_time: u64,
    pub end_time: u64,
    pub canceled: bool,
    /// Arbitrary key-value labels for off-chain indexing (e.g. department, project).
    pub metadata: Option<Map<String, String>>,
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
enum DataKey {
    NextStreamId,
    Stream(u64),
    /// Stores the designated admin address set at initialization.
    Admin,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StreamCreated {
    pub stream_id: u64,
    pub sender: Address,
    pub recipient: Address,
    pub token: Address,
    pub total_amount: i128,
    pub start_time: u64,
    pub end_time: u64,
    /// Metadata attached at creation time; None when no labels were provided.
    pub metadata: Option<Map<String, String>>,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StreamClaimed {
    pub stream_id: u64,
    pub recipient: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StreamCanceled {
    pub stream_id: u64,
    pub sender: Address,
}

/// Emitted when an admin claws back tokens from a stream for compliance purposes.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClawbackExecuted {
    pub stream_id: u64,
    pub amount: i128,
    pub recipient: Address,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct StellarStreamContract;

#[contractimpl]
impl StellarStreamContract {
    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    /// One-time setup: stores the admin address used for clawback authorization.
    /// Panics if called a second time to prevent privilege escalation.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    // -----------------------------------------------------------------------
    // Stream creation
    // -----------------------------------------------------------------------

    pub fn create_stream(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        total_amount: i128,
        start_time: u64,
        end_time: u64,
        metadata: Option<Map<String, String>>,
    ) -> u64 {
        sender.require_auth();

        if total_amount <= 0 {
            panic!("total_amount must be positive");
        }
        if end_time <= start_time {
            panic!("end_time must be greater than start_time");
        }

        let token_client = TokenClient::new(&env, &token);
        let sender_balance = token_client.balance(&sender);
        if sender_balance < total_amount {
            panic!("insufficient sender balance");
        }

        // Escrow: transfer total_amount from sender into this contract.
        let contract_address = env.current_contract_address();
        token_client.transfer(&sender, &contract_address, &total_amount);

        let mut next_id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::NextStreamId)
            .unwrap_or(0);
        next_id += 1;

        let stream = Stream {
            sender: sender.clone(),
            recipient: recipient.clone(),
            token: token.clone(),
            total_amount,
            claimed_amount: 0,
            start_time,
            end_time,
            canceled: false,
            metadata: metadata.clone(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::NextStreamId, &next_id);
        env.storage()
            .persistent()
            .set(&DataKey::Stream(next_id), &stream);

        env.events().publish(
            (symbol_short!("Stream"), symbol_short!("Created")),
            StreamCreated {
                stream_id: next_id,
                sender,
                recipient,
                token,
                total_amount,
                start_time,
                end_time,
                metadata,
            },
        );

        next_id
    }

    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------

    pub fn get_stream(env: Env, stream_id: u64) -> Stream {
        read_stream(&env, stream_id)
    }

    pub fn get_next_stream_id(env: Env) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::NextStreamId)
            .unwrap_or(0)
    }

    pub fn claimable(env: Env, stream_id: u64, at_time: u64) -> i128 {
        let stream = read_stream(&env, stream_id);
        let vested = vested_amount(&stream, at_time);
        let claimable = vested - stream.claimed_amount;
        if claimable < 0 { 0 } else { claimable }
    }

    // -----------------------------------------------------------------------
    // Claim
    // -----------------------------------------------------------------------

    pub fn claim(env: Env, stream_id: u64, recipient: Address, amount: i128) -> i128 {
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let mut stream = read_stream(&env, stream_id);
        if stream.recipient != recipient {
            panic!("recipient mismatch");
        }
        recipient.require_auth();

        let now = env.ledger().timestamp();
        let claimable_now = Self::claimable(env.clone(), stream_id, now);

        if amount > claimable_now {
            panic!("amount exceeds claimable");
        }

        let token_client = TokenClient::new(&env, &stream.token);
        let contract_address = env.current_contract_address();
        token_client.transfer(&contract_address, &recipient, &amount);

        stream.claimed_amount += amount;
        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        env.events().publish(
            (symbol_short!("Stream"), symbol_short!("Claimed")),
            StreamClaimed { stream_id, recipient, amount },
        );

        amount
    }

    // -----------------------------------------------------------------------
    // Cancel
    // -----------------------------------------------------------------------

    pub fn cancel(env: Env, stream_id: u64, sender: Address) {
        let mut stream = read_stream(&env, stream_id);
        if stream.sender != sender {
            panic!("sender mismatch");
        }
        sender.require_auth();

        if stream.canceled {
            return;
        }

        let now = env.ledger().timestamp();
        stream.canceled = true;

        let vested = vested_amount(&stream, now);
        let sender_refund = stream.total_amount - vested;

        let min_end = if now > stream.start_time { now } else { stream.start_time };
        if min_end < stream.end_time {
            stream.end_time = min_end;
            stream.total_amount = vested;
        }

        if sender_refund > 0 {
            let token_client = TokenClient::new(&env, &stream.token);
            let contract_address = env.current_contract_address();
            token_client.transfer(&contract_address, &sender, &sender_refund);
        }

        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        env.events().publish(
            (symbol_short!("Stream"), symbol_short!("Canceled")),
            StreamCanceled { stream_id, sender },
        );
    }

    // -----------------------------------------------------------------------
    // Clawback (compliance)
    // -----------------------------------------------------------------------

    /// Compliance clawback: an admin-only operation that pulls up to
    /// `amount` unclaimed-vested tokens from a stream back to the admin address.
    ///
    /// Designed for regulated-asset scenarios (e.g. USDC with clawback enabled)
    /// where a designated authority must be able to reclaim tokens for legal reasons.
    ///
    /// The caller must be the admin address stored at `initialize` time.
    /// Non-admin callers panic with "unauthorized".
    pub fn clawback(env: Env, stream_id: u64, amount: i128, admin: Address) -> i128 {
        // Verify caller is the stored admin
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("contract not initialized"));
        if admin != stored_admin {
            panic!("unauthorized");
        }
        admin.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        let mut stream = read_stream(&env, stream_id);
        let now = env.ledger().timestamp();

        // Cap at unclaimed vested tokens to match acceptance criteria.
        // claimed_amount accumulates both recipient claims and prior clawbacks.
        let vested = vested_amount(&stream, now);
        let unclaimed_vested = vested - stream.claimed_amount;
        if unclaimed_vested <= 0 {
            panic!("nothing to claw back");
        }
        let clawback_amount = if amount > unclaimed_vested { unclaimed_vested } else { amount };

        // Transfer from escrow to admin
        let token_client = TokenClient::new(&env, &stream.token);
        let contract_address = env.current_contract_address();
        token_client.transfer(&contract_address, &admin, &clawback_amount);

        // Account for the transferred tokens so recipients cannot re-claim them
        stream.claimed_amount += clawback_amount;
        env.storage()
            .persistent()
            .set(&DataKey::Stream(stream_id), &stream);

        env.events().publish(
            (symbol_short!("Stream"), symbol_short!("Clawback")),
            ClawbackExecuted {
                stream_id,
                amount: clawback_amount,
                recipient: admin,
            },
        );

        clawback_amount
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn read_stream(env: &Env, stream_id: u64) -> Stream {
    env.storage()
        .persistent()
        .get(&DataKey::Stream(stream_id))
        .unwrap_or_else(|| panic!("stream not found"))
}

fn vested_amount(stream: &Stream, at_time: u64) -> i128 {
    if at_time <= stream.start_time {
        return 0;
    }

    let effective_time = if at_time >= stream.end_time {
        stream.end_time
    } else {
        at_time
    };

    let elapsed = effective_time - stream.start_time;
    let total_duration = stream.end_time - stream.start_time;

    if total_duration == 0 {
        return 0;
    }

    stream.total_amount * (elapsed as i128) / (total_duration as i128)
}

#[cfg(test)]
mod test;
