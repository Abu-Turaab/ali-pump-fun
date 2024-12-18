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
    #[msg("Invalid initial virtual base token reserves")]
    InvalidInitVirtBaseReserves,
    #[msg("Invalid initial virtual quote token reserves")]
    InvalidInitVirtQuoteReserves,
    #[msg("Invalid real quote token threshold")]
    InvalidRealQuoteThreshold,

    #[msg("Wrong base token amount on creation")]
    WrongBaseAmountOnCreation,
    #[msg("Base token must not be mintable")]
    BaseTokenMustNotBeMintable,
    #[msg("Base token must not be freezable")]
    BaseTokenMustNotBeFreezable,

    #[msg("Quote token amount must be greater than 0")]
    WrongQuoteAmount,
    #[msg("Base token amount must be greater than 0")]
    WrongBaseAmount,

    #[msg("Insufficient fund")]
    InsufficientFund,

    #[msg("Unknown quote token")]
    UnknownQuoteMint,
    #[msg("Invalid token pair")]
    InvalidTokenPair,

    #[msg("Too few output tokens")]
    TooFewOutputTokens,
    #[msg("Too much input quote")]
    TooMuchInputQuote,
    #[msg("Too low output quote")]
    TooLowOutputQuote,

    #[msg("BondingCurve incomplete")]
    BondingCurveIncomplete,
    #[msg("BondingCurve complete")]
    BondingCurveComplete,
    #[msg("BondingCurve already withdrawn")]
    BondingCurveAlreadyWithdrawn
}
