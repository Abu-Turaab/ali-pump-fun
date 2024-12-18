use anchor_lang::prelude::error_code;

#[error_code]
pub enum PumpFunError {
    #[msg("Unauthorised")]
    Unauthorised,
    #[msg("Already became an owner")]
    AlreadyBecameOwner,

    #[msg("Invalid fee")]
    InvalidFee,
    #[msg("Invalid total supply")]
    InvalidTotalSupply,
    #[msg("Invalid initial virtual base reserves")]
    InvalidInitVirtBaseReserves,
    #[msg("Invalid initial virtual quote reserves")]
    InvalidInitVirtQuoteReserves,
    #[msg("Invalid real quote threshold")]
    InvalidRealQuoteThreshold,

    #[msg("Wrong base amount on creation")]
    WrongBaseAmountOnCreation,
    #[msg("Base token must not be mintable")]
    BaseTokenMustNotBeMintable,
    #[msg("Base token must not be freezable")]
    BaseTokenMustNotBeFreezable,

    #[msg("Quote amount must be greater than 0")]
    WrongQuoteAmount,
    #[msg("Base amount must be greater than 0")]
    WrongBaseAmount,

    #[msg("Insufficient fund")]
    InsufficientFund,

    #[msg("One token should be Sol")]
    UnknownToken,
    #[msg("Invalid token pair")]
    InvalidTokenPair,

    #[msg("Too few output tokens")]
    TooFewOutputTokens,
    #[msg("Too much input sol")]
    TooMuchInputSol,
    #[msg("Too low output sol")]
    TooLowOuputSol,
    #[msg("Exceeded maximum buy amount")]
    ExceededMaxBuy,

    #[msg("BondingCurve incomplete")]
    BondingCurveIncomplete,
    #[msg("BondingCurve complete")]
    BondingCurveComplete,
    #[msg("BondingCurve already withdrawn")]
    BondingCurveAlreadyWithdrawn
}
