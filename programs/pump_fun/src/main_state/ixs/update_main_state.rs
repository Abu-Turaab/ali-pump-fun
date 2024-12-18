use crate::{
    constants::{NATIVE_MINT_STR, MAX_TRADING_FEE},
    error::PumpFunError,
    MainState,
    MainStateUpdated
};
use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{Mint, Token, TokenAccount}};


// MainState update parameters
#[derive(AnchorDeserialize, AnchorSerialize, Debug, Clone, Copy)]
pub struct UpdateMainStateInput {
    withdrawer: Pubkey,                     // New withdrawer
    fee_recipient: Pubkey,                  // New fee recipient
    trading_fee: u64,                       // New trading fee
    total_supply: Option<u64>,              // New token supply (optional)
    init_virt_base_reserves: Option<u64>,   // New initial virtual token reserves (optional)
    init_virt_quote_reserves: Option<u64>,  // New initial virtual SOL reserves (optinoal)
    real_quote_threshold: Option<u64>       // New real SOL threshold (optional)
}

// This function updates main state
// Params
//   ctx - MainStatate update context
//   input - MainState update parameters
// Return
//   Ok on success, ErrorCode on failure
pub fn update_main_state(
    ctx: Context<AUpdateMainState>,
    input: UpdateMainStateInput,
) -> Result<()> {
    // input parameters check
    require!(
        input.trading_fee.ge(&(0 as u64)) && input.trading_fee.le(&MAX_TRADING_FEE),
        PumpFunError::InvalidFee
    );

    let main_state = &mut ctx.accounts.main_state;

    // Update new members
    main_state.withdrawer = input.withdrawer;
    main_state.fee_recipient = input.fee_recipient;
    main_state.trading_fee = input.trading_fee;
    
    if let Some(total_supply) = input.total_supply {
        require!(total_supply > 0, PumpFunError::InvalidTotalSupply);
        main_state.total_supply = total_supply;
    }
    if let Some(init_virt_base_reserves) = input.init_virt_base_reserves {
        require!(init_virt_base_reserves > 0, PumpFunError::InvalidInitVirtBaseReserves);
        main_state.init_virt_base_reserves = init_virt_base_reserves;
    }
    if let Some(init_virt_quote_reserves) = input.init_virt_quote_reserves {
        require!(init_virt_quote_reserves > 0, PumpFunError::InvalidInitVirtQuoteReserves);
        main_state.init_virt_quote_reserves = init_virt_quote_reserves;
    }
    if let Some(real_quote_threshold) = input.real_quote_threshold {
        require!(real_quote_threshold > 0, PumpFunError::InvalidRealQuoteThreshold);
        main_state.real_quote_threshold = real_quote_threshold;
    }

    emit!(MainStateUpdated {
        withdrawer: input.withdrawer,
        fee_recipient: input.fee_recipient,
        trading_fee: input.trading_fee,
        total_supply: input.total_supply.unwrap_or(main_state.total_supply),
        init_virt_base_reserves: input.init_virt_base_reserves.unwrap_or(main_state.init_virt_base_reserves),
        init_virt_quote_reserves: input.init_virt_quote_reserves.unwrap_or(main_state.init_virt_quote_reserves),
        real_quote_threshold: input.real_quote_threshold.unwrap_or(main_state.real_quote_threshold),
    });
    
    Ok(())
}

// MainState update context - passed with accounts
#[derive(Accounts)]
#[instruction(input: UpdateMainStateInput)]
pub struct AUpdateMainState<'info> {
    #[account(mut)]
    pub owner: Signer<'info>, // Current owner
    #[account(
        mut,
        seeds = [MainState::PREFIX_SEED],
        bump,
        has_one = owner,
    )]
    pub main_state: Account<'info, MainState>, // MainState account with new values

    #[account(
        constraint = quote_mint.key().to_string() == NATIVE_MINT_STR @ PumpFunError::UnknownToken
    )]
    pub quote_mint: Box<Account<'info, Mint>>,
    #[account(address = input.fee_recipient)]
    /// CHECK: this should be set by admin
    pub fee_recipient: AccountInfo<'info>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = quote_mint,
        associated_token::authority = fee_recipient
    )]
    /// CHECK: this should be set by input.fee_recipient
    pub fee_quote_ata: Box<Account<'info, TokenAccount>>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>
}
