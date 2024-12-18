use crate::{
    constants::QUOTE_MINT_STR,
    MainState, PoolState,
    CreateEvent,
    error::PumpFunError,
    utils::{sync_native_amount},
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, SyncNative, Token, TokenAccount, Transfer},
};


/*** Note: Here, 'pool' means 'bonding curve' - they've got the same meaning ***/

// This function creates a new pool
// Params
//   ctx - CreatePool context
//   base_amount - Base token amount to put in the bonding curve
// Return
//   Ok on success, ErrorCode on Failure
//     CreateEvent is emitted on success
pub fn create_pool(ctx: Context<ACreatePool>) -> Result<()> {
    let main_state = &mut ctx.accounts.main_state;

    let base_amount: u64 = ctx.accounts.creator_base_ata.amount;
    require!(base_amount.eq(&ctx.accounts.base_mint.supply), PumpFunError::WrongBaseAmountOnCreation);
    require!(base_amount.eq(&main_state.total_supply), PumpFunError::WrongBaseAmountOnCreation);
    require!(&ctx.accounts.base_mint.mint_authority.is_some().eq(&false), PumpFunError::BaseTokenMustNotBeMintable);
    require!(&ctx.accounts.base_mint.freeze_authority.is_some().eq(&false), PumpFunError::BaseTokenMustNotBeFreezable);

    let pool_state = &mut ctx.accounts.pool_state;
    let creator = ctx.accounts.creator.to_account_info();
    let creator_base_ata = &ctx.accounts.creator_base_ata;
    let token_program = ctx.accounts.token_program.to_account_info();
    
    // Initialize all members of pool_state
    pool_state.owner = creator.key(); // Creator's address
    pool_state.base_mint = creator_base_ata.mint; // Base token mint address
    pool_state.quote_mint = ctx.accounts.quote_mint.key(); // Quote token mint address
    pool_state.real_base_reserves = main_state.total_supply; // Total supply of base tokens is all put into the pool
    pool_state.virt_base_reserves = main_state.init_virt_base_reserves; // Initial virtual token reserves
    pool_state.real_quote_reserves = 0; // 0 SOL
    pool_state.virt_quote_reserves = main_state.init_virt_quote_reserves; // Initial virtual quote token reserves
    pool_state.real_quote_threshold = main_state.real_quote_threshold; // Real quote token threshold

    /* Transfer */
    // Transfer base tokens from creator to pool
    let base_transfer_cpi_accounts = Transfer {
        from: ctx.accounts.creator_base_ata.to_account_info(),
        to: ctx.accounts.reserver_base_ata.to_account_info(),
        authority: creator.clone(),
    };
    token::transfer(
        CpiContext::new(token_program.to_account_info(), base_transfer_cpi_accounts),
        base_amount,
    )?;

    // Emit createPool event
    emit!(CreateEvent {
        creator: pool_state.owner, 
        base_mint: pool_state.base_mint, 
        // quote_mint: pool_state.quote_mint, 
        base_reserves: pool_state.real_base_reserves + pool_state.virt_base_reserves, // the sum of real base token reserves and virtual base token reserves
        quote_reserves: pool_state.virt_quote_reserves, // virtual quote token reserves only
        timestamp: Clock::get()?.unix_timestamp
    });

    Ok(())
}

// CreatePool context
#[derive(Accounts)]
pub struct ACreatePool<'info> {
    #[account(mut)]
    pub creator: Signer<'info>, // Pool creator

    #[account(
        seeds = [MainState::PREFIX_SEED],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>, // MainState account
    #[account(
        init,
        payer = creator,
        seeds =[
            PoolState::PREFIX_SEED,
            base_mint.key().as_ref(),
            quote_mint.key().as_ref(),
        ],
        bump,
        space = 8 + PoolState::MAX_SIZE
    )]
    pub pool_state: Box<Account<'info, PoolState>>, // (New) PoolState account

    #[account(
        constraint = base_mint.key().to_string() != quote_mint.key().to_string() @ PumpFunError::InvalidTokenPair
    )]
    pub base_mint: Box<Account<'info, Mint>>, // Base token mint account
    #[account(
        constraint = quote_mint.key().to_string() == QUOTE_MINT_STR @ PumpFunError::UnknownQuoteMint
    )]
    pub quote_mint: Box<Account<'info, Mint>>, // Quote token mint account

    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = creator
    )]
    pub creator_base_ata: Box<Account<'info, TokenAccount>>, // Creator's base token ATA

    #[account(
        init,
        payer = creator,
        associated_token::mint = base_mint,
        associated_token::authority = pool_state,
        constraint = reserver_base_ata.amount == 0 // PoolState's base token amount must be 0
    )]
    pub reserver_base_ata: Box<Account<'info, TokenAccount>>, // PoolState's base token ATA
    #[account(
        init,
        payer = creator,
        associated_token::mint = quote_mint,
        associated_token::authority = pool_state,
    )]
    pub reserver_quote_ata: Box<Account<'info, TokenAccount>>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
