import { AnchorProvider, web3 } from "@coral-xyz/anchor";
import { BaseSpl } from "./connectivity/base/baseSpl";

export async function createToken({ decimals, supply }: { decimals: number, supply: number }, provider: AnchorProvider) {
    const connection = provider.connection
    const baseSpl = new BaseSpl(connection)
    const owner = provider.publicKey
    const txInfo = await baseSpl.createToken({ mintAuthority: owner, decimals, mintingInfo: { tokenAmount: supply } })
    const { ixs, mintKeypair } = txInfo
    const tx = new web3.Transaction().add(...ixs)
    const ix2 = baseSpl.revokeAuthority({ mint: mintKeypair.publicKey, authorityType: 'MINTING', currentAuthority: owner })
    tx.add(ix2)
    const ix3 = baseSpl.revokeAuthority({ mint: mintKeypair.publicKey, authorityType: 'FREEZING', currentAuthority: owner })
    tx.add(ix3)
    const txSignature = await provider.sendAndConfirm(tx, [mintKeypair])
    return {
        txSignature,
        mint: mintKeypair.publicKey
    }
}

export async function transferToken({ to, mint, amount }: { to: string, mint: string, amount: number }, provider: AnchorProvider) {
    const connection = provider.connection
    const baseSpl = new BaseSpl(connection)
    const sender = provider.publicKey
    const ixs = await baseSpl.transfer({ sender, receiver: to, mint, amount, init_if_needed: true })
    const tx = new web3.Transaction().add(...ixs)
    const txSignatrue = await provider.sendAndConfirm(tx)
    return txSignatrue
}
