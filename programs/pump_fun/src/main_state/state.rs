use anchor_lang::prelude::*;

// Main state of Program
#[account]
pub struct MainState {
    pub owner: Pubkey,                  // Address of the Program owner (The initializer becomes the initial program owner)
    pub withdrawer: Pubkey,             // Address of withdrawer
    pub fee_recipient: Pubkey,          // Address of the fee recipient (Owner becomes the initial fee recipient)
    pub trading_fee: u64,               // Trading fee applied on buying/selling tokens (default: 1%)
    pub total_supply: u64,              // Total supply of tokens (default: 1 billion)
    pub init_virt_base_reserves: u64,   // Initial virtual token reserves (default: 6.353% of total supply)
    pub init_virt_quote_reserves: u64,  // Initial virtual SOL reserves (default: 28 SOL for ~4.5K mcap)
    pub real_quote_threshold: u64,      // Real SOL threshold (default: 85 SOL)
}

impl MainState {
    pub const MAX_SIZE: usize = std::mem::size_of::<Self>();    // Size of MainState
    pub const PREFIX_SEED: &'static [u8] = b"main";             // Seed of MainState
}
