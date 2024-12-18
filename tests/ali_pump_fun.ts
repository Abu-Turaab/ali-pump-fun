import * as anchor from "@coral-xyz/anchor";
import { web3 } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AliPumpFun } from "../target/types/ali_pump_fun";
import { Connectivity } from "./connectivity/ali_index";
import { createToken, transferToken } from "./helper";
import { sleep } from "./connectivity/utils";
import { assert } from "chai";

const log = console.log
let quoteToken: any = null

describe("ali_pump_fun", () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider);
  const program = anchor.workspace.AliPumpFun as Program<AliPumpFun>;
  const connectivity = new Connectivity({ programId: program.programId, rpcEndPoint: provider.connection.rpcEndpoint, walletInfo: provider })
  
  const creatorAuthority = web3.Keypair.generate()
  const creatorProvider = new anchor.AnchorProvider(provider.connection, new anchor.Wallet(creatorAuthority), {})
  const creatorConnectivity = new Connectivity({ programId: program.programId, rpcEndPoint: provider.connection.rpcEndpoint, walletInfo: creatorProvider })
  const creator = creatorAuthority.publicKey
  
  const userAuthority = web3.Keypair.generate()
  const userProvider = new anchor.AnchorProvider(provider.connection, new anchor.Wallet(userAuthority), {})
  const userConnectivity = new Connectivity({ programId: program.programId, rpcEndPoint: provider.connection.rpcEndpoint, walletInfo: userProvider })
  const user = userAuthority.publicKey

  const withdrawerAuthority = web3.Keypair.generate()
  const withdrawerProvider = new anchor.AnchorProvider(provider.connection, new anchor.Wallet(withdrawerAuthority), {})
  const withdrawerConnectivity = new Connectivity({ programId: program.programId, rpcEndPoint: provider.connection.rpcEndpoint, walletInfo: withdrawerProvider })
  const withdrawer = withdrawerAuthority.publicKey
  
  const connection = provider.connection;
  const commonState: { mint?: string, poolId?: string } = {}
  let boughtAmount = 0

  before(async () => {
    await connection.requestAirdrop(creator, 1_000_000_000) // 1 SOL
    await connection.requestAirdrop(user, 1_000_000_000) // 1 SOL
    await connection.requestAirdrop(withdrawer, 1_000_000_000) // 1 SOL
    await sleep(3000)
    
    const quoteTokenTxInfo = await createToken({ decimals: 8, supply: 1_000_000 }, creatorProvider) // Total supply: 1M (ALI)
    quoteToken = quoteTokenTxInfo.mint.toBase58()
    console.log('quoteToken:', quoteToken)
    await sleep(3000)

    // send 500k quote tokens to user
    const transferTokenTxSig = await transferToken({ to: user.toBase58(), mint: quoteToken, amount: 400_000 }, creatorProvider) // Transfer 500K ALI to user
    // console.log('  transferTokenTxSig:', transferTokenTxSig)
    await sleep(3000)
    
    const mainState = connectivity.pdas.mainState
    const mainStateInfo = await connection.getAccountInfo(mainState)
    if (!mainStateInfo) {
      await connectivity.initMainState({ quoteToken })
    }
    
    const createTokenTxInfo = await createToken({ decimals: 6, supply: 1_000_000_000 }, creatorProvider)
    commonState.mint = createTokenTxInfo.mint.toBase58()
    console.log('baseToken:', commonState.mint)

    // const listenerCreateEvent = program.addEventListener('CreateEvent', (event, slot) => {
    //   console.log('slot: ', slot,  'event: ', event)
    // })
  })

  it("create pool", async () => {
    const baseToken = commonState.mint
    if (!baseToken) throw "Base token not found"
    await sleep(3_000)
    const res = await creatorConnectivity.createPool({ baseToken, quoteToken })
    if (res.Err) {
      log(`Error: ${res.Err}`)
      throw "tx failed"
    }
    if (!res.Ok) throw "tx failed"
    const poolId = res.Ok.poolId
    log(`poolId: ${poolId}`)
    commonState.poolId = poolId
  });

  // it("buy", async () => {
  //   const poolId = commonState.poolId
  //   if (!poolId) throw "pool id not found"
  //   await sleep(3_000)
  //   const amount = 2_000
  //   const outputAmount = (await userConnectivity.getOutputAmountOnBuy({ inputAmount: amount, poolId })).Ok
  //   boughtAmount = outputAmount as number
  //   log(`Buy Output Amount: ${outputAmount}`)
  //   const res = await userConnectivity.buy({ poolId, amount })
  //   if (res.Err) {
  //     log(`Error: ${res.Err}`)
  //     throw "buy fail"
  //   }
  //   if (!res.Ok) throw "sell failed"
  //   log(`Buy Tx Sign: ${res.Ok.txSignature}`)
  // })

  // it("sell", async () => {
  //   const poolId = commonState.poolId
  //   if (!poolId) throw "pool id not found"
  //   await sleep(3_000)
  //   const amount = boughtAmount // sell out bought tokens
  //   const outputAmount = (await userConnectivity.getOutputAmountOnSell({ inputAmount: amount, poolId })).Ok
  //   log(`Sell Output Amount: ${outputAmount}`)
  //   const res = await userConnectivity.sell({ poolId, amount })
  //   if (res.Err) {
  //     log(`Error: ${res.Err}`)
  //     throw "sell fail"
  //   }
  //   if (!res.Ok) throw "sell failed"
  //   log(`Sell Tx Sign: ${res.Ok.txSignature}`)
  // })

  // it("update mainState", async () => {
  //   const res = await connectivity.updateMainState({ newWithdrawer: withdrawer.toString(), quoteToken, newTradingFee: 2 })
  //   if (res.Err) {
  //     log(`Error: ${res.Err}`)
  //     throw "updateMainState fail"
  //   }
  //   if (!res.Ok) throw "updateMainState failed"
  //   log(`updateMainState Tx Sign: ${res.Ok.txSignature}`)
  // })

  // it("buy2", async () => {
  //   const poolId = commonState.poolId
  //   if (!poolId) throw "pool id not found"
  //   await sleep(3_000)
  //   const amount = 2_000
  //   const outputAmount = (await userConnectivity.getOutputAmountOnBuy({ inputAmount: amount, poolId })).Ok
  //   boughtAmount = outputAmount as number
  //   log(`Buy Output Amount: ${outputAmount}`)
  //   const res = await userConnectivity.buy({ poolId, amount })
  //   if (res.Err) {
  //     log(`Error: ${res.Err}`)
  //     throw "buy fail"
  //   }
  //   if (!res.Ok) throw "sell failed"
  //   log(`Buy Tx Sign: ${res.Ok.txSignature}`)
  // })

  // it("sell2", async () => {
  //   const poolId = commonState.poolId
  //   if (!poolId) throw "pool id not found"
  //   await sleep(3_000)
  //   const amount = boughtAmount
  //   const outputAmount = (await userConnectivity.getOutputAmountOnSell({ inputAmount: amount, poolId })).Ok
  //   log(`Output Amount: ${outputAmount}`)
  //   const res = await userConnectivity.sell({ poolId, amount })
  //   if (res.Err) {
  //     log(`Error: ${res.Err}`)
  //     throw "sell fail"
  //   }
  //   if (!res.Ok) throw "sell failed"
  //   log(`Sell Tx Sign: ${res.Ok.txSignature}`)
  // })
  
  // it("withdraw (BondingCurveIncomplete: Fail)", async () => {
  //   await sleep(3_000)
  //   const poolId = commonState.poolId
  //   if (!poolId) throw "pool id not found"
  //   const res = await withdrawerConnectivity.withdraw({ poolId })
  //   if (res.Ok) assert.fail("Withdraw should be failed (BondingCurveIncomplete")
  // })
  
  // it("buy3_1", async () => {
  //   const poolId = commonState.poolId
  //   if (!poolId) throw "pool id not found"
  //   await sleep(3_000)
  //   const quoteAmount = 200_000
  //   const outputAmount = (await creatorConnectivity.getOutputAmountOnBuy({ inputAmount: quoteAmount, poolId })).Ok
  //   boughtAmount = outputAmount as number
  //   log(`Output Amount: ${outputAmount}`)
  //   const res = await creatorConnectivity.buy({ poolId, amount: quoteAmount })
  //   if (res.Err) {
  //     log(`Error: ${res.Err}`)
  //     throw "buy fail"
  //   }
  //   if (!res.Ok) throw "sell failed"
  //   log(`Buy Tx Sign: ${res.Ok.txSignature}`)

  //   const poolStateInfo = await userConnectivity.getPoolInfo(poolId)
  //   log(`poolStateInfo.realBaseReserves: ${poolStateInfo?.realBaseReserves}`);
  //   log(`poolStateInfo.realQuoteReserves: ${poolStateInfo?.realQuoteReserves}`);
  // })

  // it("buy3_2", async () => {
  //   const poolId = commonState.poolId
  //   if (!poolId) throw "pool id not found"
  //   await sleep(3_000)
  //   const quoteAmount = 200_000
  //   const tokenAmount = (await creatorConnectivity.getOutputAmountOnBuy({ inputAmount: quoteAmount, poolId })).Ok || 0
  //   log(`Expected Output Amount: ${tokenAmount}`)
  //   // const inputAmount = (await creatorConnectivity.getInputAmountOnBuy({ outputAmount: tokenAmount, poolId })).Ok
  //   // boughtAmount = inputAmount as number
  //   // log(`Input Amount: ${inputAmount}`)
  //   const res = await creatorConnectivity.buy2({ poolId, amount: (tokenAmount + 1) })
  //   if (res.Err) {
  //     log(`Error: ${res.Err}`)
  //     throw "buy fail"
  //   }
  //   if (!res.Ok) throw "sell failed"
  //   log(`Buy Tx Sign: ${res.Ok.txSignature}`)

  //   const poolStateInfo = await userConnectivity.getPoolInfo(poolId)
  //   log(`poolStateInfo.realBaseReserves: ${poolStateInfo?.realBaseReserves}`);
  //   log(`poolStateInfo.realQuoteReserves: ${poolStateInfo?.realQuoteReserves}`);
  // })

  // it("withdraw", async () => {
  //   await sleep(3_000)
  //   const poolId = commonState.poolId
  //   if (!poolId) throw "pool id not found"
  //   const res = await withdrawerConnectivity.withdraw({ poolId })
  //   if (res.Err) {
  //     log(`Error: ${res.Err}`)
  //     throw "Withdraw Tx Error"
  //   }
  //   if (!res.Ok) throw "withdraw failed"
  //   log(`Withdraw Tx Sign: ${res.Ok.txSignature}`)
  // })

  // it("withdraw (Unauthorised: Fail)", async () => {
  //   await sleep(3_000)
  //   const poolId = commonState.poolId
  //   if (!poolId) throw "pool id not found"
  //   const res = await userConnectivity.withdraw({ poolId })
  //   if (res.Ok) assert.fail("Tx should be failed (Unauthorised access)")
  // })

  // it("transfer ownership", async () => {
  //   await sleep(3_000)
  //   const res = await connectivity.transferOwnership(user)
  //   if (res.Err) {
  //     log(`Error: ${res.Err}`)
  //     throw "TransferOwnership Tx Error"
  //   }
  //   if (!res.Ok) throw "TransferOwnership failed"
  //   log(`TransferOwnership Tx Sign: ${res.Ok.txSignature}`)
  // })
});
