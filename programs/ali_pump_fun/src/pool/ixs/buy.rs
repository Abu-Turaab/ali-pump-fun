use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{self, Mint, Token, TokenAccount, Transfer}};
use crate::{
    MainState, PoolState, 
    TradeEvent, CompleteEvent, 
    error::PumpFunError, 
    main_state, 
    utils::{calculate_trading_fee, calculate_total_amount, close_token_account, sync_native_amount}
};

// Internal buy function
// Params
//   ctx - Buy context
//   base_amount - Amount of base tokens to buy
//   fee - Trading fee
//   input_quote_amount - Amount of quote token to buy with (fee excluded)
// Return
//   Ok on success
//     If successful, emits (Buy) TradeEvent
//       And if reaches complete marketCap, emits CompleteEvent as well
fn buy_finalize(ctx: Context<ABuy>, base_amount: u64, fee: u64, input_quote_amount: u64) -> Result<()> {
    let pool_state = &mut ctx.accounts.pool_state;
    let buyer = ctx.accounts.buyer.to_account_info();
    let buyer_base_ata = &ctx.accounts.buyer_base_ata;
    let buyer_quote_ata = &ctx.accounts.buyer_quote_ata;
    let token_program = ctx.accounts.token_program.to_account_info();

    // Transfer fee (quote) from buyer to feeRecpient
    let fee_transfer_cpi_account = Transfer {
        from: buyer_quote_ata.to_account_info(),
        to: ctx.accounts.fee_quote_ata.to_account_info(),
        authority: buyer.clone()
    };
    token::transfer(CpiContext::new(token_program.clone(), fee_transfer_cpi_account), fee)?;
    
    // Transfer input_quote_amount (quote) from buyer to pool
    let input_amount_transfer_cpi_account = Transfer {
        from: buyer_quote_ata.to_account_info(),
        to: ctx.accounts.reserver_quote_ata.to_account_info(),
        authority: buyer.clone()
    };
    token::transfer(CpiContext::new(token_program.clone(), input_amount_transfer_cpi_account), input_quote_amount)?;
    
    // Transfer base tokens from pool to buyer
    let output_amount_transfer_cpi_account = Transfer {
        from: ctx.accounts.reserver_base_ata.to_account_info(),
        to: buyer_base_ata.to_account_info(),
        authority: pool_state.to_account_info()
    };
    token::transfer(CpiContext::new_with_signer(token_program.clone(), output_amount_transfer_cpi_account, &[&[
        PoolState::PREFIX_SEED,
        pool_state.base_mint.as_ref(),
        pool_state.quote_mint.as_ref(),
        &[ctx.bumps["pool_state"]]
    ]]), base_amount)?;

    // // Unwrap WSOL (or close token account)
    // close_token_account(buyer.clone(), buyer_quote_ata.to_account_info(), token_program)?;

    // Emit (Buy) TradeEvent
    emit!(TradeEvent {
        user: buyer.key(), 
        base_mint: pool_state.base_mint, 
        // quote_mint: pool_state.quote_mint, 
        base_amount: base_amount, 
        quote_amount: fee + input_quote_amount, 
        base_reserves: pool_state.real_base_reserves + pool_state.virt_base_reserves, 
        quote_reserves: pool_state.virt_quote_reserves + pool_state.real_quote_reserves, 
        is_buy: true, 
        timestamp: Clock::get()?.unix_timestamp
    });

    // Check if bonding curve becomes complete
    if (pool_state.real_quote_reserves >= pool_state.real_quote_threshold) {
        pool_state.complete = true;
        
        // Emit CompleteEvent
        emit!(CompleteEvent {
            // user: buyer.key(), 
            base_mint: pool_state.base_mint, 
            // quote_mint: pool_state.quote_mint, 
            timestamp: Clock::get()?.unix_timestamp,
        });
    }

    Ok(())
}

// This function buys base tokens on the bonding curve, with specified amount of quote
// Params
//   ctx - Buy context
//   quote_amount - Amount of quote tokens to buy base tokens with
//   min_base_amount - Minimum amount of base tokens to receive
// Return
//   Ok on success, ErrorCode on failure
pub fn buy_tokens_from_exact_quote(ctx:Context<ABuy>, quote_amount: u64, min_base_amount: u64) -> Result<()> {
    require!(quote_amount.gt(&0), PumpFunError::WrongQuoteAmount); // quote_amount must be greater than 0

    let main_state = &mut ctx.accounts.main_state;
    
    let pool_state = &mut ctx.accounts.pool_state;
    require!(pool_state.complete.eq(&false), PumpFunError::BondingCurveComplete); // BondingCurve must not be complete

    let buyer = ctx.accounts.buyer.to_account_info();
    let buyer_base_ata = &ctx.accounts.buyer_base_ata;
    let buyer_quote_ata = &ctx.accounts.buyer_quote_ata;
    let token_program = ctx.accounts.token_program.to_account_info();
    let system_program = ctx.accounts.system_program.to_account_info();

    // if new real_quote_reserves exceeds threshold, restrict quote_amount
    let mut _quote_amount = quote_amount;
    let mut fee = calculate_trading_fee(main_state.trading_fee, _quote_amount);
    if (pool_state.real_quote_reserves + (_quote_amount - fee) > pool_state.real_quote_threshold) {
        _quote_amount = calculate_total_amount(main_state.trading_fee, pool_state.real_quote_threshold - pool_state.real_quote_reserves);
        fee = calculate_trading_fee(main_state.trading_fee, _quote_amount);
    }
    
    let input_quote_amount = _quote_amount - fee;
    let output_base_amount = pool_state.compute_receivable_amount_on_buy(input_quote_amount);
    require!(output_base_amount >= min_base_amount, PumpFunError::TooFewOutputTokens); // Check minimum amount

    pool_state.real_quote_reserves += input_quote_amount; // Increase Real Quote
    pool_state.real_base_reserves -= output_base_amount; // Decrease Real Base
    
    // // Convert Buyer's SOL to WSOL if necessary
    // sync_native_amount(buyer.clone(), &buyer_quote_ata, _quote_amount, system_program.clone(), token_program.clone())?;

    buy_finalize(ctx, output_base_amount, fee, input_quote_amount)
}

// This function buys specified amount of base tokens on the bonding curve (required quote token amount is calculated internally)
// Params
//   ctx - Buy context
//   base_amount - Amount of base tokens to buy
//   max_quote_amount - Maximum amount of quote tokens allowed to spend
// Return
//   Ok on success, ErrorCode on failure
pub fn buy_exact_tokens_from_quote(ctx:Context<ABuy>, base_amount: u64, max_quote_amount: u64) -> Result<()> {
    let main_state = &mut ctx.accounts.main_state;
    
    let pool_state = &mut ctx.accounts.pool_state;
    require!(pool_state.complete.eq(&false), PumpFunError::BondingCurveComplete); // BondingCurve must not be complete

    // base_amount must be greater than 0 and less than or equal to real_base_reserves
    require!(base_amount.gt(&0) && base_amount.le(&pool_state.real_base_reserves), PumpFunError::WrongBaseAmount);

    let buyer = ctx.accounts.buyer.to_account_info();
    let buyer_base_ata = &ctx.accounts.buyer_base_ata;
    let buyer_quote_ata = &ctx.accounts.buyer_quote_ata;
    let token_program = ctx.accounts.token_program.to_account_info();
    let system_program = ctx.accounts.system_program.to_account_info();

    let mut input_base_amount = base_amount;
    let mut input_quote_amount = pool_state.compute_required_amount_on_buy(input_base_amount);
    // if new real_quote_reserves exceeds threshold, restrict quote_amount
    if (pool_state.real_quote_reserves + input_quote_amount > pool_state.real_quote_threshold) {
        input_quote_amount = pool_state.real_quote_threshold - pool_state.real_quote_reserves;
        input_base_amount = pool_state.compute_receivable_amount_on_buy(input_quote_amount);
    }
    
    let total_quote_amount = calculate_total_amount(main_state.trading_fee, input_quote_amount);
    let fee = calculate_trading_fee(main_state.trading_fee, total_quote_amount);
    require!(total_quote_amount <= max_quote_amount, PumpFunError::TooMuchInputQuote);

    pool_state.real_base_reserves -= input_base_amount; // Decrease Real Base
    pool_state.real_quote_reserves += input_quote_amount; // Increase Real Quote
    
    // // Convert Buyer's SOL to WSOL if necessary
    // sync_native_amount(buyer.clone(), &buyer_quote_ata, total_quote_amount, system_program.clone(), token_program.clone())?;

    buy_finalize(ctx, input_base_amount, fee, input_quote_amount)
}


// Buy context
#[derive(Accounts)]
pub struct ABuy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>, // Buyer
    #[account(
        seeds = [MainState::PREFIX_SEED],
        bump,
    )]
    pub main_state: Box<Account<'info, MainState>>, // MainState account
    
    #[account(address = main_state.fee_recipient)]
    /// CHECK: this should be set by admin
    pub fee_recipient: AccountInfo<'info>, // FeeRecipient
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = quote_mint,
        associated_token::authority = fee_recipient,
    )]
    /// CHECK: this should be set by fee_recipient
    pub fee_quote_ata: Box<Account<'info, TokenAccount>>, // FeeRecipient's quote token ATA

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

    #[account(address = pool_state.base_mint)]
    pub base_mint: Box<Account<'info, Mint>>, // Base token account
    #[account(address = pool_state.quote_mint)]
    pub quote_mint: Box<Account<'info, Mint>>, // Quote token account
    
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = base_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_base_ata: Box<Account<'info, TokenAccount>>, // Buyer's base token ATA
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = quote_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_quote_ata: Box<Account<'info, TokenAccount>>, // Buyer's quote token ATA

    #[account(
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = pool_state,
    )]
    pub reserver_base_ata: Box<Account<'info, TokenAccount>>, // PoolState's base token ATA
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = pool_state,
    )]
    pub reserver_quote_ata: Box<Account<'info, TokenAccount>>, // PoolState's quote token ATA

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
