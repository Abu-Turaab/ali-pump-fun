const anchor = require("@coral-xyz/anchor");
const {Buffer} = require("buffer");
const {Connection, Transaction, PublicKey, SystemProgram, ComputeBudgetProgram} = require("@solana/web3.js");
const {TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync} = require("@solana/spl-token");
const {load_sol_keypair_from_env, load_json_rpc_endpoint_from_env, load_program_id_param, load_program_name_param, get_quote_mint, get_main_state_defaults, print_obj} = require("./utils");

// read the environment variables from .env file
require("dotenv").config();

// check if there is a key or mnemonic available in the environment
if(!process.env.SOL_KEY && !process.env.MNEMONIC) {
	console.error("Neither SOL_KEY nor MNEMONIC is set. Valid Solana wallet required to initialize Solana program state.");
	process.exit(1);
}

const deployerKey = load_sol_keypair_from_env();
const jsonRpcEndpoint = load_json_rpc_endpoint_from_env();
const programIdPubKey = load_program_id_param();
const programName = load_program_name_param();
const idl = require(`../target/idl/${programName}.json`);

// we're going to use async/await programming style, therefore, we put
// all the logic into async main and execute it at the end of the file
// see https://javascript.plainenglish.io/writing-asynchronous-programs-in-javascript-9a292570b2a6
async function main() {
	// set up the connection
	const connection = new Connection(jsonRpcEndpoint);
	const provider = new anchor.AnchorProvider(
		connection,
		new anchor.Wallet(deployerKey),
		{commitment: "processed"}
	);
	const MAIN_STATE_PREFIX_SEED = "main";
	anchor.setProvider(provider);

	// Create the program interface
	const program = new anchor.Program(idl, programIdPubKey, provider);
	const [mainStateKey] = await asyncGetPda([Buffer.from(MAIN_STATE_PREFIX_SEED)], programIdPubKey);
	console.log("mainStateKey: %s", mainStateKey);

	// prepare and send bundled transaction with the priority fee
	const {blockhash} = await connection.getLatestBlockhash();
	console.log("recentBlockHash: %o", blockhash);
	const transaction = new Transaction({
		recentBlockhash: blockhash,
		feePayer: deployerKey.publicKey,
	});

	const quoteMint = get_quote_mint(programName);
	console.log("quoteMint: %s", quoteMint);

	// transaction payload (transaction 1)
	const ctx = { // struct AInitMainState<'info>
		owner: deployerKey.publicKey,
		mainState: new PublicKey(mainStateKey),
		quoteMint: quoteMint,
		feeQuoteAta: getAssociatedTokenAddressSync(quoteMint, deployerKey.publicKey),
		associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
		tokenProgram: TOKEN_PROGRAM_ID,
		systemProgram: SystemProgram.programId,
	};
	const tx1 = await program.methods.initMainState().accounts(ctx).instruction();
	transaction.add(tx1);
	// priority fee (transaction 2)
	transaction.add(ComputeBudgetProgram.setComputeUnitPrice({microLamports: 100_000}));

	// execute the bundle and wait for confirmation
	const signature = await connection.sendTransaction(transaction, [deployerKey]);
	await connection.confirmTransaction(signature, "confirmed");
	console.log("init main state complete: %o", signature);
	console.log(print_obj(ctx));
}

const asyncGetPda = async(seeds, programId) => {
	const [pubKey, bump] = await PublicKey.findProgramAddress(seeds, programId);
	return [pubKey, bump];
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
