use crate::{
    error::PumpFunError,
    MainState,
    OwnershipTransferred,
};
use anchor_lang::prelude::*;

// This function transfers ownership to other user
// Params
//   ctx - Owner update context
//   new_owner - Address of new owner
// Return
//   Ok on success, ErrorCode on failure
pub fn transfer_ownership(
    ctx: Context<ATransferOwnership>,
    new_owner: Pubkey
) -> Result<()> {
    let main_state = &mut ctx.accounts.main_state;
    require!(main_state.owner.ne(&new_owner), PumpFunError::AlreadyBecameOwner); // Don't need to transfer ownership to the same user

    let previous_owner = main_state.owner;

    // Update owner
    main_state.owner = new_owner;

    emit!(OwnershipTransferred {
        previous_owner,
        new_owner
    });

    Ok(())
}

// Transfer owner context - passed with accounts
#[derive(Accounts)]
pub struct ATransferOwnership<'info> {
    #[account(mut)]
    pub owner: Signer<'info>, // Current owner
    #[account(
        mut,
        seeds = [MainState::PREFIX_SEED],
        bump,
        has_one = owner,
    )]
    pub main_state: Box<Account<'info, MainState>>, // MainState account with new values
}
