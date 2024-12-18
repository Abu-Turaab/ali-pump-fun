use crate::{
    constants::{QUOTE_MINT_STR, DEFAULT_OWNER, TOTAL_SUPPLY, INIT_VIRT_BASE_RESERVE, INIT_VIRT_QUOTE_RESERVE, REAL_QUOTE_THRESHOLD, FEE_PER_DIV},
    MainState,
    MainStateInitialized,
    error::PumpFunError
};
use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{Mint, Token, TokenAccount}};
use std::str::FromStr;

// This function initializes main state
// Params
//   ctx - MainState initialization context
// Return
//   Ok on success, ErrorCode on failure
pub fn init_main_state(ctx: Context<AInitMainState>) -> Result<()> {
    let state = &mut ctx.accounts.main_state;

    // Initialize all members
    state.owner = ctx.accounts.owner.key();
    state.withdrawer = ctx.accounts.owner.key();
    
    state.fee_recipient = ctx.accounts.owner.key();
    state.trading_fee = 1 * FEE_PER_DIV as u64; // 1%
    
    state.total_supply = TOTAL_SUPPLY;
    state.init_virt_base_reserves = INIT_VIRT_BASE_RESERVE;
    state.init_virt_quote_reserves = INIT_VIRT_QUOTE_RESERVE;
    state.real_quote_threshold = REAL_QUOTE_THRESHOLD;

    emit!(MainStateInitialized {
        owner: state.owner,
        withdrawer: state.withdrawer,
        fee_recipient: state.fee_recipient,
        trading_fee: state.trading_fee,
        total_supply: state.total_supply,
        init_virt_base_reserves: state.init_virt_base_reserves,
        init_virt_quote_reserves: state.init_virt_quote_reserves,
        real_quote_threshold: state.real_quote_threshold
    });

    Ok(())
}

// MainState initialization struct - passed with accounts
#[derive(Accounts)]
pub struct AInitMainState<'info> {
    #[account(
        mut,
        address = Pubkey::from_str(DEFAULT_OWNER).unwrap() @ PumpFunError::Unauthorised
    )]
    pub owner: Signer<'info>, // Program owner
    #[account(
        init,
        payer = owner,
        seeds = [MainState::PREFIX_SEED],
        bump,
        space = 8 + MainState::MAX_SIZE
    )]
    pub main_state: Box<Account<'info, MainState>>, // MainState account

    #[account(
        constraint = quote_mint.key().to_string() == QUOTE_MINT_STR @ PumpFunError::UnknownQuoteMint
    )]
    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        payer = owner,
        associated_token::mint = quote_mint,
        associated_token::authority = owner,
    )]
    /// CHECK: this should be set by owner
    pub fee_quote_ata: Box<Account<'info, TokenAccount>>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
