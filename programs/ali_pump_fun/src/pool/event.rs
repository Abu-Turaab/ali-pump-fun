use anchor_lang::prelude::*;

// BondingCurve create event
#[event]
pub struct CreateEvent {
    pub creator: Pubkey,        // Creator wallet address
    pub base_mint: Pubkey,      // Creating token mint address
    // pub quote_mint: Pubkey,  // Quote token mint address
    pub base_reserves: u64,     // Number of total base token reserves
    pub quote_reserves: u64,    // Number of total quote token reserves
    pub timestamp: i64,         // Creation time
}

// BondingCurve trade event
#[event]
pub struct TradeEvent {
    pub user: Pubkey,           // Trader wallet address
    pub base_mint: Pubkey,      // Trading token mint address
    // pub quote_mint: Pubkey,  // Quote token mint address
    pub base_amount: u64,       // Traded amount of base tokens
    pub quote_amount: u64,      // Traded amount of quote tokens
    pub base_reserves: u64,     // Updated base token reserves
    pub quote_reserves: u64,    // Updated quote token reserves
    pub is_buy: bool,           // Flag indicating whether the user bought or sold
    pub timestamp: i64,         // Traded time
}

// BondingCurve complete event
#[event]
pub struct CompleteEvent {
    // pub user: Pubkey,
    pub base_mint: Pubkey,      // Completed token mint address
    // pub quote_mint: Pubkey,  // Quote token mint address
    pub timestamp: i64,         // Completed time
}

// BondingCurve withdraw event
#[event]
pub struct WithdrawEvent {
    pub withdrawer: Pubkey,
    pub base_mint: Pubkey,      // Withdraw token mint address
    // pub quote_mint: Pubkey,  // Quote token mint address
    pub base_amount: u64,       // Withdrawn base token amount
    pub quote_amount: u64,      // Withdrawn quote token amount
    pub timestamp: i64,         // Withdraw time
}
