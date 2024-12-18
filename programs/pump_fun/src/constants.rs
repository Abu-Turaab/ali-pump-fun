use std::str::FromStr;
use anchor_lang::solana_program::pubkey::Pubkey;

pub const NATIVE_MINT_STR: &'static str = "So11111111111111111111111111111111111111112"; // WSOL mint address

pub const DEFAULT_OWNER: &'static str = "G78JVtRk57Ra3p7PUV7fWoSNxa4TkUf4Qq8PWGzFckXY"; // Default owner address

pub const FEE_PER_DIV: u128 = 1000; // 1000 for 1%
pub const MAX_TRADING_FEE: u64 = 5 * FEE_PER_DIV as u64; // 5%

pub const TOTAL_SUPPLY: u64 = 1_000_000_000_000_000; // 1 billion token
pub const INIT_VIRT_BASE_RESERVE: u64 = 63_529_411_764_705; // ~6.353% of total supply
pub const INIT_VIRT_QUOTE_RESERVE: u64 = 28_000_000_000; // 28 SOL
pub const REAL_QUOTE_THRESHOLD: u64 = 85_000_000_000; // +85 SOL
 