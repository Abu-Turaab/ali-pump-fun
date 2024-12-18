use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{self, Mint, Token, TokenAccount, Transfer}};
use crate::{
    MainState, PoolState, 
    TradeEvent, 
    error::PumpFunError, 
    main_state, 
    utils::{calculate_trading_fee, close_token_account, sync_native_amount, check_balance}, 
};

// This function sells base tokens on the bonding curve
// Params
//   ctx - Sell context
//   base_amount - Amount of base tokens to sell
//   min_quote_amount - Minimum amount of quote token to receive
// Return
//   Ok on success, ErrorCode on failure
pub fn sell(ctx:Context<ASell>, base_amount: u64, min_quote_amount: u64) -> Result<()> {
    // base_amount must be greater than 0 and less than real_base_reserves
    require!(base_amount.gt(&0), PumpFunError::WrongBaseAmount);
    
    let main_state = &mut ctx.accounts.main_state;

    let pool_state = &mut ctx.accounts.pool_state;
    require!(pool_state.complete.eq(&false), PumpFunError::BondingCurveComplete); // BondingCurve must not be complete

    let seller = ctx.accounts.seller.to_account_info();
    let seller_base_ata = &ctx.accounts.seller_base_ata;
    let seller_quote_ata = &ctx.accounts.seller_quote_ata;
    let fee_quote_ata = &ctx.accounts.fee_quote_ata;
    let token_program = ctx.accounts.token_program.to_account_info();
    
    let input_base_amount = base_amount;
    let _output_amount = pool_state.compute_receivable_amount_on_sell(input_base_amount);
    
    let fee = calculate_trading_fee(main_state.trading_fee, _output_amount);
    let output_amount = _output_amount - fee;

    require!(output_amount >= min_quote_amount, PumpFunError::TooLowOutputQuote);

    pool_state.real_base_reserves += input_base_amount; // Increase Real Base
    pool_state.real_quote_reserves -= _output_amount; // Decrease Real Quote

    // Transfer base tokens from seller to pool
    let input_amount_transfer_cpi_account = Transfer {
        from: seller_base_ata.to_account_info(),
        to: ctx.accounts.reserver_base_ata.to_account_info(),
        authority: seller.clone()
    };
    token::transfer(CpiContext::new(token_program.clone(), input_amount_transfer_cpi_account), input_base_amount)?;
    
    // Transfer fee (quote) from pool to feeRecipient
    let fee_transfer_cpi_account = Transfer {
        from: ctx.accounts.reserver_quote_ata.to_account_info(),
        to: fee_quote_ata.to_account_info(),
        authority: pool_state.to_account_info()
    };
    token::transfer(CpiContext::new_with_signer(token_program.clone(), fee_transfer_cpi_account, &[&[
        PoolState::PREFIX_SEED,
        pool_state.base_mint.as_ref(),
        pool_state.quote_mint.as_ref(),
        &[ctx.bumps["pool_state"]]
    ]]), fee)?;

    // Transfer output_amount (quote) from pool to seller
    let output_amount_transfer_cpi_account = Transfer {
        from: ctx.accounts.reserver_quote_ata.to_account_info(),
        to: seller_quote_ata.to_account_info(),
        authority: pool_state.to_account_info()
    };
    token::transfer(CpiContext::new_with_signer(token_program.clone(), output_amount_transfer_cpi_account, &[&[
        PoolState::PREFIX_SEED,
        pool_state.base_mint.as_ref(),
        pool_state.quote_mint.as_ref(),
        &[ctx.bumps["pool_state"]]
    ]]), output_amount)?;

    // // Unwrap WSOL (or close token account)
    // close_token_account(seller.clone(), seller_quote_ata.to_account_info(), token_program)?;

    // Emit (Sell) TradeEvent
    emit!(TradeEvent {
        user: seller.key(), 
        base_mint: pool_state.base_mint, 
        // quote_mint: pool_state.quote_mint, 
        base_amount: base_amount, 
        quote_amount: output_amount, 
        base_reserves: pool_state.real_base_reserves + pool_state.virt_base_reserves, 
        quote_reserves: pool_state.virt_quote_reserves + pool_state.real_quote_reserves, 
        is_buy: false, 
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

// Sell context
#[derive(Accounts)]
#[instruction(base_amount: u64)]
pub struct ASell<'info> {
    #[account(mut)]
    pub seller: Signer<'info>, // Seller
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
        payer = seller,
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
        mut,
        associated_token::mint = base_mint,
        associated_token::authority = seller,
        constraint = check_balance(seller_base_ata.as_ref(), base_amount) @ PumpFunError::InsufficientFund
    )]
    pub seller_base_ata: Box<Account<'info, TokenAccount>>, // Seller's base token ATA
    #[account(
        init_if_needed,
        payer = seller,
        associated_token::mint = quote_mint,
        associated_token::authority = seller,
    )]
    pub seller_quote_ata: Box<Account<'info, TokenAccount>>, // Seller's quote token ATA

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
