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
const withdrawalManagerPubKey = function() {
	// Find the index of --withdrawal_manager
	const withdrawalManagerIndex = process.argv.indexOf("--withdrawal_manager");

	// Check if --withdrawal_manager is present and has a value
	if(withdrawalManagerIndex < 0 || withdrawalManagerIndex + 1 >= process.argv.length) {
		console.error("Withdrawal Manager: --withdrawal_manager is not provided, or its value is missing");
		process.exit(1);
	}

	const withdrawalManager = process.argv[withdrawalManagerIndex + 1];
	console.log("Withdrawal Manager: %o", withdrawalManager);
	return new PublicKey(withdrawalManager);
}();
const feeRecipientPubKey = function() {
	// Find the index of --fee_recipient
	const feeRecipientIndex = process.argv.indexOf("--fee_recipient");

	// Check if --fee_recipient is present and has a value
	if(feeRecipientIndex < 0 || feeRecipientIndex + 1 >= process.argv.length) {
		console.error("Fee Recipient: --fee_recipient is not provided, or its value is missing");
		process.exit(1);
	}

	const feeRecipient = process.argv[feeRecipientIndex + 1];
	console.log("Fee Recipient: %o", feeRecipient);
	return new PublicKey(feeRecipient);
}();

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
	const updateMainStateInput = Object.assign({
		withdrawer: withdrawalManagerPubKey,
		feeRecipient: feeRecipientPubKey,
	}, get_main_state_defaults(programName));
	const ctx = { // struct AInitMainState<'info>
		owner: deployerKey.publicKey,
		mainState: new PublicKey(mainStateKey),
		quoteMint: quoteMint,
		feeRecipient: feeRecipientPubKey,
		feeQuoteAta: getAssociatedTokenAddressSync(quoteMint, feeRecipientPubKey),
		associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
		tokenProgram: TOKEN_PROGRAM_ID,
		systemProgram: SystemProgram.programId,
	};
	const tx1 = await program.methods.updateMainState(updateMainStateInput).accounts(ctx).instruction();
	transaction.add(tx1);
	// priority fee (transaction 2)
	transaction.add(ComputeBudgetProgram.setComputeUnitPrice({microLamports: 100_000}));

	// execute the bundle and wait for confirmation
	const signature = await connection.sendTransaction(transaction, [deployerKey]);
	await connection.confirmTransaction(signature, "confirmed");
	console.log("update main state complete: %o", signature);
	console.log(print_obj(ctx), print_obj(updateMainStateInput));
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
