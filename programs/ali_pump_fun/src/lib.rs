#![allow(unused)]

use anchor_lang::prelude::*;

pub mod main_state;
pub mod pool;

pub mod constants;
pub mod error;
pub mod utils;

use main_state::*;
use pool::*;

declare_id!("3gfMvGB7L2TrBw8CwaRzKZ9KySKrh4cFG23ZUFKoBN99");

#[program]
pub mod ali_pump_fun {
    use super::*;

    pub fn init_main_state(ctx: Context<AInitMainState>) -> Result<()> {
        main_state::init_main_state(ctx)
    }

    pub fn transfer_ownership(ctx: Context<ATransferOwnership>, new_owner: Pubkey) -> Result<()> {
        main_state::transfer_ownership(ctx, new_owner)
    }
    
    pub fn update_main_state(ctx: Context<AUpdateMainState>, input: UpdateMainStateInput) -> Result<()> {
        main_state::update_main_state(ctx, input)
    }

    
    pub fn create_pool(ctx: Context<ACreatePool>) -> Result<()> {
        pool::create_pool(ctx)
    }

    pub fn buy_tokens_from_exact_quote(ctx: Context<ABuy>, quote_amount: u64, min_base_amount: u64) -> Result<()> {
        pool::buy_tokens_from_exact_quote(ctx, quote_amount, min_base_amount)
    }

    pub fn buy_exact_tokens_from_quote(ctx: Context<ABuy>, base_amount: u64, max_quote_amount: u64) -> Result<()> {
        pool::buy_exact_tokens_from_quote(ctx, base_amount, max_quote_amount)
    }

    pub fn sell(ctx: Context<ASell>, amount: u64, min_quote_output: u64) -> Result<()> {
        pool::sell(ctx, amount, min_quote_output)
    }
    
    pub fn withdraw(ctx: Context<AWithdraw>) -> Result<()> {
        pool::withdraw(ctx)
    }
}


//test
