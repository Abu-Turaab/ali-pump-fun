import { AnchorProvider, Program, Wallet, web3 } from '@coral-xyz/anchor'
import { PumpFun, IDL as PumpFunIDL } from '../../target/types/pump_fun'
import { Result, TxPassResult } from './types'
import { PumpFunError } from './error';
import { FEE_PRE_DIV, PROGRAMS, debug } from './constants';
import { Pdas } from './pdas';
import BN from 'bn.js';
import { calculateOutputAmount, calculateInputAmount, getMultipleAccountsInfo, getPubkeyFromStr, sleep } from './utils';
import { MintLayout, NATIVE_MINT, getAssociatedTokenAddressSync, getMint, mintTo } from '@solana/spl-token';
import { calcDecimalValue, calcNonDecimalValue } from './base/utils';
import { toBufferBE, toBigIntBE } from 'bigint-buffer'
import { PoolStateLayout } from './base/types';
import { utf8 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

const { systemProgram, tokenProgram, associatedTokenProgram } = PROGRAMS
const todo = null as any;

export type MainStateInfo = {
    tradingFee: number,
    owner: string, 
    feeRecipient: string,
    realQuoteThreshold: number
}

export type PoolInfo = {
    owner: web3.PublicKey,
    baseMint: web3.PublicKey,
    quoteMint: web3.PublicKey,
    realBaseReserves: BN,
    virtBaseReserves: BN,
    realQuoteReserves: BN,
    virtQuoteReserves: BN,
}

export class Connectivity {
    private program: Program<PumpFun>
    private connection: web3.Connection
    private provider: AnchorProvider
    pdas: Pdas
    constructor(input: { walletInfo: Wallet | AnchorProvider, rpcEndPoint: string, programId: web3.PublicKey }) {
        const { programId, rpcEndPoint, walletInfo } = input
        this.connection = new web3.Connection(rpcEndPoint)
        if (walletInfo instanceof AnchorProvider) {
            this.provider = walletInfo
        } else {
            this.provider = new AnchorProvider(this.connection, walletInfo, { commitment: 'confirmed' })
        }
        this.program = new Program(PumpFunIDL, programId, this.provider)
        this.pdas = new Pdas(this.program.programId)
    }

    async initMainState(input: { quoteToken: string }): Promise<Result<TxPassResult>> {
        const owner = this.provider.publicKey
        if (!owner) return { Err: PumpFunError.WALLET_NOT_FOUND }

        const quoteMint = getPubkeyFromStr(input.quoteToken)
        if (!quoteMint) return { Err: PumpFunError.INVALID_INPUT }

        const feeQuoteAta = getAssociatedTokenAddressSync(quoteMint, owner)

        const txSignature = await this.program.methods.initMainState().accounts({
            owner, mainState: this.pdas.mainState,
            quoteMint,
            feeQuoteAta,
            associatedTokenProgram,
            tokenProgram,
            systemProgram,
        }).rpc().catch((initMainStateError) => {
            debug({ initMainStateError })
            return null
        })
        if (!txSignature) return { Err: PumpFunError.TX_FAILED }
        return { Ok: { txSignature } }
    }

    async transferOwner(newOwner: web3.PublicKey): Promise<Result<TxPassResult>> {
        const owner = this.provider.publicKey
        if (!owner) return { Err: PumpFunError.WALLET_NOT_FOUND }

        const mainState = this.pdas.mainState
        const mainStateInfo = await this.program.account.mainState.fetch(mainState)
            .catch((fetchMainStateInfoError) => { debug({ fetchMainStateInfoError }); return null })
        if (!mainStateInfo) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }

        const txSignature = await this.program.methods.transferOwner(newOwner
        )
        .accounts({
            owner, 
            mainState: this.pdas.mainState,
        }).rpc().catch(updateMainStateError => {
            debug({ updateMainStateError })
            return null
        })
        if (!txSignature) return { Err: PumpFunError.TX_FAILED }
        return { Ok: { txSignature } }
    }

    async updateMainState(input: {
        newWithdrawer?: string,
        newFeeRecipient?: string,
        quoteToken?: string,
        newTradingFee?: number,
        newTotalSupply?: number,
        newInitVirtBaseReserves?: number,
        newInitVirtQuoteReserves?: number,
        newRealQuoteThreshold?: number
    }): Promise<Result<TxPassResult>> {
        const owner = this.provider.publicKey
        if (!owner) return { Err: PumpFunError.WALLET_NOT_FOUND }

        const quoteMint = (input?.quoteToken) ? getPubkeyFromStr(input?.quoteToken) : NATIVE_MINT
        if (!quoteMint) return { Err: PumpFunError.INVALID_INPUT }

        const mainState = this.pdas.mainState
        const mainStateInfo = await this.program.account.mainState.fetch(mainState)
            .catch((fetchMainStateInfoError) => { debug({ fetchMainStateInfoError }); return null })
        if (!mainStateInfo) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }

        let newWithdrawer: null | web3.PublicKey = null
        let newFeeRecipient: null | web3.PublicKey = null
        let newTradingFee: null | BN = null
        let newTotalSupply: null | BN = null
        let newInitVirtBaseReserves: null | BN = null
        let newInitVirtQuoteReserves: null | BN = null
        let newRealQuoteThreshold: null | BN = null
        
        if (input.newWithdrawer) {
            const address = getPubkeyFromStr(input.newWithdrawer)
            if (!address) return { Err: PumpFunError.INVALID_INPUT }
            newWithdrawer = address
        } else {
            newWithdrawer = mainStateInfo.withdrawer
        }

        if (input.newFeeRecipient) {
            const address = getPubkeyFromStr(input.newFeeRecipient)
            if (!address) return { Err: PumpFunError.INVALID_INPUT }
            newFeeRecipient = address
        } else {
            newFeeRecipient = mainStateInfo.feeRecipient
        }

        if (input.newTradingFee) {
            const tmpFee = Math.trunc(input.newTradingFee * FEE_PRE_DIV)
            newTradingFee = new BN(tmpFee)
        } else {
            newTradingFee = mainStateInfo.tradingFee
        }

        if (input.newTotalSupply) {
            const tmpTotalSupply = input.newTotalSupply
            newTotalSupply = new BN(tmpTotalSupply)
        }
        
        if (input.newInitVirtBaseReserves) {
            const tmpVirtTokenReserves = input.newInitVirtBaseReserves
            newInitVirtBaseReserves = new BN(tmpVirtTokenReserves)
        }
        
        if (input.newInitVirtQuoteReserves) {
            const tmpVirtSolReserves = input.newInitVirtQuoteReserves
            newInitVirtQuoteReserves = new BN(tmpVirtSolReserves)
        }

        if (input.newRealQuoteThreshold) {
            const tmpRealQuoteThreshold = input.newRealQuoteThreshold
            newRealQuoteThreshold = new BN(tmpRealQuoteThreshold)
        }

        const feeQuoteAta = getAssociatedTokenAddressSync(quoteMint, newFeeRecipient)
        
        const txSignature = await this.program.methods.updateMainState({ 
            withdrawer: newWithdrawer, 
            feeRecipient: newFeeRecipient, 
            tradingFee: newTradingFee, 
            totalSupply: newTotalSupply, 
            initVirtBaseReserves: newInitVirtBaseReserves, 
            initVirtQuoteReserves: newInitVirtQuoteReserves,
            realQuoteThreshold: newRealQuoteThreshold
        })
        .accounts({
            owner, 
            mainState: this.pdas.mainState,
            quoteMint, 
            feeRecipient: newFeeRecipient, 
            feeQuoteAta
        }).rpc().catch(updateMainStateError => {
            debug({ updateMainStateError })
            return null
        })
        if (!txSignature) return { Err: PumpFunError.TX_FAILED }
        return { Ok: { txSignature } }
    }

    async createPool(input: { baseToken: string, quoteToken: string }): Promise<Result<TxPassResult & { poolId: string }>> {
        const creator = this.provider.publicKey
        if (!creator) return { Err: PumpFunError.WALLET_NOT_FOUND }
        const baseMint = getPubkeyFromStr(input.baseToken)
        const quoteMint = getPubkeyFromStr(input.quoteToken)
        if (!baseMint || !quoteMint) return { Err: PumpFunError.INVALID_INPUT }
        // const infos = await getMultipleAccountsInfo(this.connection, [baseMint, quoteMint])
        // if (!infos) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        // const [baseMintAccountInfo, quoteMintAccountInfo] = infos
        // if (!baseMintAccountInfo) {
        //     debug("base token not found")
        //     return { Err: PumpFunError.TOKEN_NOT_FOUND }
        // }
        // if (!quoteMintAccountInfo) {
        //     debug("quote token not found")
        //     return { Err: PumpFunError.TOKEN_NOT_FOUND }
        // }
        const creatorBaseAta = getAssociatedTokenAddressSync(baseMint, creator)
        const poolState = this.pdas.getPoolStateAccount({ baseMint, quoteMint, owner: creator })
        const reserverBaseAta = getAssociatedTokenAddressSync(baseMint, poolState, true)
        const reserverQuoteAta = getAssociatedTokenAddressSync(quoteMint, poolState, true)
        const txSignature = await this.program.methods.createPool().accounts({
            creator: creator,
            mainState: this.pdas.mainState,
            poolState,
            baseMint, quoteMint,
            creatorBaseAta,
            reserverBaseAta, reserverQuoteAta,
            associatedTokenProgram,
            tokenProgram,
            systemProgram
        }).preInstructions([web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })]).rpc().catch(createPoolError => {
            debug({ createPoolError })
            return null
        })
        if (!txSignature) return { Err: PumpFunError.TX_FAILED }
        return { Ok: { txSignature, poolId: poolState.toBase58() } }
    }

    async buy(input: { amount: number, poolId: string }) {
        const buyer = this.provider.publicKey
        if (!buyer) return { Err: PumpFunError.WALLET_NOT_FOUND }
        const poolState = getPubkeyFromStr(input.poolId)
        if (!poolState) return { Err: PumpFunError.INVALID_INPUT }
        const mainStateInfo = await this.program.account.mainState.fetch(this.pdas.mainState)
            .catch((fetchMainStateInfoError) => { debug({ fetchMainStateInfoError }); return null })
        if (!mainStateInfo) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        const poolInfo = await this.program.account.poolState.fetch(poolState)
            .catch((fetchPoolInfoError) => { debug({ fetchPoolInfoError }); return null })
        if (!poolInfo) return { Err: PumpFunError.POOL_NOT_FOUND }
        const { baseMint, quoteMint } = poolInfo
        // const reserveBaseAmount = toBigIntBE(poolInfo.reserveBase.toBuffer())
        // const reserveQuoteAmount = toBigIntBE(poolInfo.reserveQuote.toBuffer())
        // const accountInfoes = await getMultipleAccountsInfo(this.connection, [baseMint, quoteMint])
        // if (!accountInfoes) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        // const [baseMintAccountInfo, quoteMintAccountInfo] = accountInfoes;
        // if (!baseMintAccountInfo) return { Err: PumpFunError.TOKEN_NOT_FOUND }
        // const baseMintDecimals = MintLayout.decode(baseMintAccountInfo.data).decimals
        const amount = new BN(toBufferBE(BigInt(calcNonDecimalValue(input.amount, 9).toString()), 8))
        const buyerBaseAta = getAssociatedTokenAddressSync(baseMint, buyer)
        const buyerQuoteAta = getAssociatedTokenAddressSync(quoteMint, buyer)
        const feeQuoteAta = getAssociatedTokenAddressSync(quoteMint, mainStateInfo.feeRecipient)
        const reserverBaseAta = getAssociatedTokenAddressSync(baseMint, poolState, true)
        const reserverQuoteAta = getAssociatedTokenAddressSync(quoteMint, poolState, true)

        const txSignature = await this.program.methods.buyTokensFromExactSol(amount, new BN(0)).accounts({
            baseMint, quoteMint,
            buyer, buyerBaseAta, buyerQuoteAta,
            poolState,
            mainState: this.pdas.mainState,
            feeRecipient: mainStateInfo.feeRecipient,
            feeQuoteAta,
            reserverBaseAta, reserverQuoteAta,
            tokenProgram, systemProgram,
            associatedTokenProgram,
        }).preInstructions([web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })]).rpc().catch(buyTxError => {
            debug({ buyTxError })
            return null
        })
        if (!txSignature) return { Err: PumpFunError.TX_FAILED }
        return { Ok: { txSignature } }
    }

    async buy2(input: { amount: number, poolId: string }) {
        const buyer = this.provider.publicKey
        if (!buyer) return { Err: PumpFunError.WALLET_NOT_FOUND }
        const poolState = getPubkeyFromStr(input.poolId)
        if (!poolState) return { Err: PumpFunError.INVALID_INPUT }
        const mainStateInfo = await this.program.account.mainState.fetch(this.pdas.mainState)
            .catch((fetchMainStateInfoError) => { debug({ fetchMainStateInfoError }); return null })
        if (!mainStateInfo) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        const poolInfo = await this.program.account.poolState.fetch(poolState)
            .catch((fetchPoolInfoError) => { debug({ fetchPoolInfoError }); return null })
        if (!poolInfo) return { Err: PumpFunError.POOL_NOT_FOUND }
        const { baseMint, quoteMint } = poolInfo
        // const reserveBaseAmount = toBigIntBE(poolInfo.reserveBase.toBuffer())
        // const reserveQuoteAmount = toBigIntBE(poolInfo.reserveQuote.toBuffer())
        // const accountInfoes = await getMultipleAccountsInfo(this.connection, [baseMint, quoteMint])
        // if (!accountInfoes) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        // const [baseMintAccountInfo, quoteMintAccountInfo] = accountInfoes;
        // if (!baseMintAccountInfo) return { Err: PumpFunError.TOKEN_NOT_FOUND }
        // const baseMintDecimals = MintLayout.decode(baseMintAccountInfo.data).decimals
        const amount = new BN(toBufferBE(BigInt(calcNonDecimalValue(input.amount, 6).toString()), 8))
        const buyerBaseAta = getAssociatedTokenAddressSync(baseMint, buyer)
        const buyerQuoteAta = getAssociatedTokenAddressSync(quoteMint, buyer)
        const feeQuoteAta = getAssociatedTokenAddressSync(quoteMint, mainStateInfo.feeRecipient)
        const reserverBaseAta = getAssociatedTokenAddressSync(baseMint, poolState, true)
        const reserverQuoteAta = getAssociatedTokenAddressSync(quoteMint, poolState, true)
        const result = await this.getInputAmountOnBuy({ outputAmount: input.amount, poolId: input.poolId })
        if (!result) return { Err: PumpFunError.INVALID_INPUT }
        const maxQuote = (result.Ok || 0 ) * 11 / 10
        const maxQuoteAmount = maxQuote * LAMPORTS_PER_SOL

        const txSignature = await this.program.methods.buyExactTokensFromSol(amount, new BN(maxQuoteAmount)).accounts({
            baseMint, quoteMint,
            buyer, buyerBaseAta, buyerQuoteAta,
            poolState,
            mainState: this.pdas.mainState,
            feeRecipient: mainStateInfo.feeRecipient,
            feeQuoteAta,
            reserverBaseAta, reserverQuoteAta,
            tokenProgram, systemProgram,
            associatedTokenProgram,
        }).preInstructions([web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })]).rpc().catch(buyTxError => {
            debug({ buyTxError })
            return null
        })
        if (!txSignature) return { Err: PumpFunError.TX_FAILED }
        return { Ok: { txSignature } }
    }

    async sell(input: { amount: number, poolId: string }) {
        const seller = this.provider.publicKey
        if (!seller) return { Err: PumpFunError.WALLET_NOT_FOUND }
        const poolState = getPubkeyFromStr(input.poolId)
        if (!poolState) return { Err: PumpFunError.INVALID_INPUT }
        const mainStateInfo = await this.program.account.mainState.fetch(this.pdas.mainState)
            .catch((fetchMainStateInfoError) => { debug({ fetchMainStateInfoError }); return null })
        if (!mainStateInfo) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        const poolInfo = await this.program.account.poolState.fetch(poolState)
            .catch((fetchPoolInfoError) => { debug({ fetchPoolInfoError }); return null })
        if (!poolInfo) return { Err: PumpFunError.POOL_NOT_FOUND }

        const { baseMint, quoteMint } = poolInfo;
        // const accountInfoes = await getMultipleAccountsInfo(this.connection, [baseMint, quoteMint])
        // if (!accountInfoes) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        // const [baseMintAccountInfo, quoteMintAccountInfo] = accountInfoes;
        // if (!baseMintAccountInfo) return { Err: PumpFunError.TOKEN_NOT_FOUND }
        const baseMintDecimals = /* MintLayout.decode(baseMintAccountInfo.data).decimals */ 6
        const sellAmount = new BN(toBufferBE(BigInt(calcNonDecimalValue(input.amount, baseMintDecimals).toString()), 8))
        const sellerBaseAta = getAssociatedTokenAddressSync(baseMint, seller)
        const sellerQuoteAta = getAssociatedTokenAddressSync(quoteMint, seller)
        const reserverBaseAta = getAssociatedTokenAddressSync(baseMint, poolState, true)
        const reserverQuoteAta = getAssociatedTokenAddressSync(quoteMint, poolState, true)
        const feeQuoteAta = getAssociatedTokenAddressSync(quoteMint, mainStateInfo.feeRecipient)

        const txSignature = await this.program.methods.sell(sellAmount, new BN(0)).accounts({
            seller, sellerBaseAta, sellerQuoteAta,
            mainState: this.pdas.mainState, baseMint, quoteMint,
            feeRecipient: mainStateInfo.feeRecipient,
            feeQuoteAta,
            poolState, reserverBaseAta, reserverQuoteAta,
            systemProgram, tokenProgram,
            associatedTokenProgram,
        }).preInstructions([web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })]).rpc().catch(sellTxError => {
            debug({ sellTxError })
            return null
        })
        if (!txSignature) return { Err: PumpFunError.TX_FAILED }
        return { Ok: { txSignature } }
    }

    async withdraw(input: { poolId: string }): Promise<Result<TxPassResult>> {
        const withdrawer = this.provider.publicKey
        if (!withdrawer) return { Err: PumpFunError.WALLET_NOT_FOUND }

        const mainState = this.pdas.mainState
        const mainStateInfo = await this.program.account.mainState.fetch(mainState)
            .catch((fetchMainStateInfoError) => { debug({ fetchMainStateInfoError }); return null })
        if (!mainStateInfo) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }

        const poolState = getPubkeyFromStr(input.poolId)
        if (!poolState) return { Err: PumpFunError.INVALID_INPUT }
        const poolInfo = await this.program.account.poolState.fetch(poolState)
            .catch((fetchPoolInfoError) => { debug({ fetchPoolInfoError }); return null })
        if (!poolInfo) return { Err: PumpFunError.POOL_NOT_FOUND }
        const { baseMint, quoteMint } = poolInfo

        const reserverBaseAta = getAssociatedTokenAddressSync(baseMint, poolState, true)
        const reserverQuoteAta = getAssociatedTokenAddressSync(quoteMint, poolState, true)

        const withdrawerBaseAta = getAssociatedTokenAddressSync(baseMint, withdrawer)
        const withdrawerQuoteAta = getAssociatedTokenAddressSync(quoteMint, withdrawer)

        const txSignature = await this.program.methods.withdraw().accounts({
            withdrawer, 
            mainState, poolState, 
            baseMint, quoteMint, 
            reserverBaseAta, reserverQuoteAta, 
            withdrawerBaseAta, withdrawerQuoteAta, 
            systemProgram, tokenProgram,
            associatedTokenProgram,
        }).rpc().catch((collectTradingFeeError) => debug({ collectTradingFeeError }));
        if (!txSignature) return { Err: PumpFunError.TX_FAILED }
        return { Ok: { txSignature } }
    }

    async getMainStateInfo(): Promise<MainStateInfo | null> {
        const mainState = this.pdas.mainState
        const mainStateInfo = await this.program.account.mainState.fetch(mainState).catch(fetchMainStateError => {
            debug({ fetchMainStateError })
            return null
        })
        if (!mainStateInfo) return null
        const tradingFee = mainStateInfo.tradingFee.toNumber() / FEE_PRE_DIV
        const realQuoteThreshold = mainStateInfo.realQuoteThreshold.toNumber()
        return {
            owner: mainStateInfo.owner.toBase58(), 
            feeRecipient: mainStateInfo.feeRecipient.toBase58(), 
            tradingFee,
            realQuoteThreshold
        }
    }

    async getPoolInfo(poolIdStr: string): Promise<PoolInfo | null> {
        const poolId = getPubkeyFromStr(poolIdStr)
        if (!poolId) {
            debug("Invalid pook key")
            return null
        }
        const poolInfo = await this.program.account.poolState.fetch(poolId).catch(fetchPoolInfoError => {
            debug({ fetchPoolInfoError })
            return null
        })
        if (!poolInfo) return null
        const { baseMint, quoteMint, realBaseReserves, virtBaseReserves, realQuoteReserves, virtQuoteReserves, owner } = poolInfo
        return {
            baseMint, quoteMint, realBaseReserves, virtBaseReserves, realQuoteReserves, virtQuoteReserves, owner
        }
    }

    async getOutputAmountOnBuy(input: { inputAmount: number, poolId: string }): Promise<Result<number>> {
        const mainState = await this.getMainStateInfo()
        if (!mainState) return { Err: PumpFunError.MAIN_STATE_INFO_NOT_FOUND }
        const poolInfo = await this.getPoolInfo(input.poolId)
        if (!poolInfo) return { Err: PumpFunError.POOL_NOT_FOUND }
        const fee = input.inputAmount * mainState.tradingFee / 100
        let inputAmount = Math.trunc((input.inputAmount - fee) * LAMPORTS_PER_SOL)
        if (Number(poolInfo.realQuoteReserves) + inputAmount > mainState.realQuoteThreshold)
            inputAmount = mainState.realQuoteThreshold - Number(poolInfo.realQuoteReserves)
        const quoteReserves = poolInfo.realQuoteReserves.add(poolInfo.virtQuoteReserves)
        const inputReserve = Number(quoteReserves.toString())
        const baseReserves = poolInfo.realBaseReserves.add(poolInfo.virtBaseReserves)
        const outputReserve = Number(baseReserves.toString())
        const outputAmount = calculateOutputAmount({ inputAmount, inputReserve, outputReserve })
        // const mintInfo = await getMint(this.connection, poolInfo.baseMint).catch(async () => {
        //     await sleep(2_000)
        //     return await getMint(this.connection, poolInfo.baseMint).catch((fetchMintInfoError) => {
        //         debug({ fetchMintInfoError })
        //         return null
        //     })
        // })
        // if (!mintInfo) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        const decimals = /* mintInfo.decimals */ 6
        return {
            Ok: calcDecimalValue(outputAmount, decimals)
        }
    }

    async getInputAmountOnBuy(input: { outputAmount: number, poolId: string }): Promise<Result<number>> {
        const mainState = await this.getMainStateInfo()
        if (!mainState) return { Err: PumpFunError.MAIN_STATE_INFO_NOT_FOUND }
        const poolInfo = await this.getPoolInfo(input.poolId)
        if (!poolInfo) return { Err: PumpFunError.POOL_NOT_FOUND }
        // const mintInfo = await getMint(this.connection, poolInfo.baseMint).catch(async () => {
        //     await sleep(2_000)
        //     return await getMint(this.connection, poolInfo.baseMint).catch((fetchMintInfoError) => {
        //         debug({ fetchMintInfoError })
        //         return null
        //     })
        // })
        // if (!mintInfo) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        const decimals = /* mintInfo.decimals */ 6
        const outputAmount = calcNonDecimalValue(input.outputAmount, decimals)
        const quoteReserves = poolInfo.realQuoteReserves.add(poolInfo.virtQuoteReserves)
        const inputReserve = Number(quoteReserves.toString())
        const baseReserves = poolInfo.realBaseReserves.add(poolInfo.virtBaseReserves)
        const outputReserve = Number(baseReserves.toString())
        const inputAmount_ = calculateInputAmount({ outputAmount, inputReserve, outputReserve })
        const fee = inputAmount_ * mainState.tradingFee / (100 - mainState.tradingFee)
        const inputAmount = inputAmount_ + fee
        return {
            Ok: calcDecimalValue(inputAmount, 9)
        }
    }

    async getOutputAmountOnSell(input: { inputAmount: number, poolId: string }): Promise<Result<number>> {
        const mainState = await this.getMainStateInfo();
        if (!mainState) return { Err: PumpFunError.MAIN_STATE_INFO_NOT_FOUND }
        const poolInfo = await this.getPoolInfo(input.poolId)
        if (!poolInfo) return { Err: PumpFunError.POOL_NOT_FOUND }
        // const mintInfo = await getMint(this.connection, poolInfo.baseMint).catch(async () => {
        //     await sleep(2_000)
        //     return await getMint(this.connection, poolInfo.baseMint).catch((fetchMintInfoError) => {
        //         debug({ fetchMintInfoError })
        //         return null
        //     })
        // })
        // if (!mintInfo) return { Err: PumpFunError.FAILED_TO_FETCH_DATA }
        const decimals = /* mintInfo.decimals */ 6
        const inputAmount = calcNonDecimalValue(input.inputAmount, decimals)
        const baseReserves = poolInfo.realBaseReserves.add(poolInfo.virtBaseReserves)
        const inputReserve = Number(baseReserves.toString())
        const quoteReserves = poolInfo.realQuoteReserves.add(poolInfo.virtQuoteReserves)
        const outputReserve = Number(quoteReserves.toString())
        const _outputAmount = calculateOutputAmount({ inputAmount, inputReserve, outputReserve })
        const fee = _outputAmount * mainState.tradingFee / 100
        const outputAmount = _outputAmount - fee
        return {
            Ok: calcDecimalValue(outputAmount, 9)
        }
    }
}