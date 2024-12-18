use crate::{
    constants::{NATIVE_MINT_STR},
    error::PumpFunError,
    MainState, PoolState,
    WithdrawEvent,
    utils::{close_token_account}
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer}
};
use std::str::FromStr;

// This function is called by withdrawer to withdraw all remaining tokens and deposited SOL from the bonding curve
// Params
//   ctx - Withdraw context
// Return
//   Ok on success, ErrorCode on failure
pub fn withdraw(ctx: Context<AWithdraw>) -> Result<()> {
    let withdrawer = ctx.accounts.withdrawer.to_account_info();
    let main_state = &ctx.accounts.main_state;
    let pool_state = &mut ctx.accounts.pool_state;

	require!(pool_state.complete.eq(&true), PumpFunError::BondingCurveIncomplete); // BondingCurve must be complete
    require!(pool_state.real_base_reserves.gt(&0) && pool_state.real_quote_reserves.gt(&0), PumpFunError::BondingCurveAlreadyWithdrawn);

    let withdrawer_base_ata = ctx.accounts.withdrawer_base_ata.to_account_info();
    let withdrawer_quote_ata = ctx.accounts.withdrawer_quote_ata.to_account_info();
    let token_program = ctx.accounts.token_program.to_account_info();

    // Transfer (meme) tokens from pool to withdrawer
    let pool_base_transfer_cpi_account = Transfer {
        from: ctx.accounts.reserver_base_ata.to_account_info(),
        to: withdrawer_base_ata.clone(),
        authority: pool_state.to_account_info()
    };
    token::transfer(CpiContext::new_with_signer(token_program.clone(), pool_base_transfer_cpi_account, &[&[
        PoolState::PREFIX_SEED,
        pool_state.base_mint.as_ref(),
        pool_state.quote_mint.as_ref(),
        &[ctx.bumps["pool_state"]]
    ]]), pool_state.real_base_reserves)?;

    // Transfer SOL from pool to withdrawer
    let pool_quote_transfer_cpi_account = Transfer {
        from: ctx.accounts.reserver_quote_ata.to_account_info(),
        to: withdrawer_quote_ata.clone(),
        authority: pool_state.to_account_info()
    };
    token::transfer(CpiContext::new_with_signer(token_program.clone(), pool_quote_transfer_cpi_account, &[&[
        PoolState::PREFIX_SEED,
        pool_state.base_mint.as_ref(),
        pool_state.quote_mint.as_ref(),
        &[ctx.bumps["pool_state"]]
    ]]), pool_state.real_quote_reserves)?;

    // Unwrap sol (or close token account)
    close_token_account(withdrawer.clone(), withdrawer_quote_ata.to_account_info(), token_program)?;

    // Emit WithdrawEvent
    emit!(WithdrawEvent {
        withdrawer: withdrawer.key(),
        base_mint: pool_state.base_mint,
        // quote_mint: pool_state.quote_mint,
        base_amount: pool_state.real_base_reserves,
        quote_amount: pool_state.real_quote_reserves,
        timestamp: Clock::get()?.unix_timestamp
    });

    pool_state.real_base_reserves = 0;
    pool_state.real_quote_reserves = 0;
    
    Ok(())
}

// Withdraw context
#[derive(Accounts)]
pub struct AWithdraw<'info> {
    #[account(
        mut,
        address = main_state.withdrawer @ PumpFunError::Unauthorised
    )]
    pub withdrawer: Signer<'info>, // Current withdrawer
    #[account(
        seeds = [MainState::PREFIX_SEED],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>, // MainState account

    #[account(
        mut,
        seeds = [
            PoolState::PREFIX_SEED,
            base_mint.key().as_ref(), 
            quote_mint.key().as_ref(),
        ],
        bump,
    )]
    pub pool_state: Box<Account<'info, PoolState>>, // PoolState account
    
    #[account(
        mut,
        address = pool_state.base_mint
    )]
    pub base_mint: Box<Account<'info, Mint>>, // Token account
    #[account(
        mut,
        address = pool_state.quote_mint
    )]
    pub quote_mint: Box<Account<'info, Mint>>, // WSOL account

    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = pool_state,
    )]
    pub reserver_base_ata: Box<Account<'info, TokenAccount>>, // PoolState's Token ATA
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = pool_state,
    )]
    pub reserver_quote_ata: Box<Account<'info, TokenAccount>>, // PoolState's WSOL ATA

    #[account(
        init_if_needed,
        payer = withdrawer,
        associated_token::mint = base_mint,
        associated_token::authority = withdrawer,
    )]
    pub withdrawer_base_ata: Box<Account<'info, TokenAccount>>, // Admin's Token ATA
    #[account(
        init_if_needed,
        payer = withdrawer,
        associated_token::mint = quote_mint,
        associated_token::authority = withdrawer,
    )]
    pub withdrawer_quote_ata: Box<Account<'info, TokenAccount>>, // Admin's WSOL ATA

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}