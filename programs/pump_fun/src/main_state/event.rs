use anchor_lang::prelude::*;

// MainState initialization event
#[event]
pub struct MainStateInitialized {
    pub owner: Pubkey,
    pub withdrawer: Pubkey,
    pub fee_recipient: Pubkey,
    pub trading_fee: u64,
    pub total_supply: u64,
    pub init_virt_base_reserves: u64,
    pub init_virt_quote_reserves: u64,
    pub real_quote_threshold: u64,
}

// Transfer ownership event
#[event]
pub struct OwnershipTransferred {
    pub previous_owner: Pubkey,
    pub new_owner: Pubkey,
}

// MainState updated event
#[event]
pub struct MainStateUpdated {
    pub withdrawer: Pubkey,
    pub fee_recipient: Pubkey,
    pub trading_fee: u64,
    pub total_supply: u64,
    pub init_virt_base_reserves: u64,
    pub init_virt_quote_reserves: u64,
    pub real_quote_threshold: u64,
}
