use std::str::FromStr;
use anchor_lang::solana_program::pubkey::Pubkey;

pub const QUOTE_MINT_STR: &'static str = "9wvorGtBJ8gyLorFTmwXWcymPoGVUBn6MRzHwFpCdCeC"; // Quote (ALI) mint address

pub const DEFAULT_OWNER: &'static str = "4Gstv5b2EhxrF5b11E8QiJ4oPa5dgRRrQCQ9tQKT4TZT"; // Default owner address

pub const FEE_PER_DIV: u128 = 1000; // 1000 for 1%
pub const MAX_TRADING_FEE: u64 = 5 * FEE_PER_DIV as u64; // 5%

pub const TOTAL_SUPPLY: u64 = 1_000_000_000_000_000; // 1 billion token
pub const INIT_VIRT_BASE_RESERVE: u64 = 66_666_666_000_000; // ~6.6666666% of total supply
pub const INIT_VIRT_QUOTE_RESERVE: u64 = 100_000_00_000_000; // 100k ALI
pub const REAL_QUOTE_THRESHOLD: u64 = 300_000_00_000_000; // +300k ALI
