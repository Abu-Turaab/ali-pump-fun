use anchor_lang::prelude::*;

// BondingCurve create event
#[event]
pub struct CreateEvent {
    pub creator: Pubkey,        // Creator wallet address
    pub base_mint: Pubkey,      // Creating token mint address
    // pub quote_mint: Pubkey,  // WSOL address
    pub base_reserves: u64,     // Number of total token reserves
    pub quote_reserves: u64,    // Number of total SOL reserves
    pub timestamp: i64,         // Creation time
}

// BondingCurve trade event
#[event]
pub struct TradeEvent {
    pub user: Pubkey,           // Trader wallet address
    pub base_mint: Pubkey,      // Trading token mint address
    // pub quote_mint: Pubkey,  // WSOL address
    pub sol_amount: u64,        // Traded amount of SOL
    pub token_amount: u64,      // Traded amount of tokens
    pub base_reserves: u64,     // Updated token reserves
    pub quote_reserves: u64,    // Updated SOL reserves
    pub is_buy: bool,           // Flag indicating whether the user bought or sold
    pub timestamp: i64,         // Traded time
}

// BondingCurve complete event
#[event]
pub struct CompleteEvent {
    // pub user: Pubkey,
    pub base_mint: Pubkey,      // Completed token mint address
    // pub quote_mint: Pubkey,  // WSOL address
    pub timestamp: i64,         // Completed time
}

// BondingCurve withdraw event
#[event]
pub struct WithdrawEvent {
    pub withdrawer: Pubkey,
    pub base_mint: Pubkey,      // Completed token mint address
    // pub quote_mint: Pubkey,  // WSOL address
    pub base_amount: u64,       // Withdrawn token amount
    pub quote_amount: u64,        // Withdrawn SOL amount
    pub timestamp: i64,         // Completed time
}
