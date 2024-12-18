const anchor = require("@coral-xyz/anchor");
const {Buffer} = require("buffer");
const {Connection, Transaction, PublicKey, SystemProgram, ComputeBudgetProgram} = require("@solana/web3.js");
const {NATIVE_MINT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync} = require("@solana/spl-token");
const {load_sol_keypair_from_env, load_json_rpc_endpoint_from_env, load_program_id_param, load_program_name_param} = require("./utils");

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
const newOwnerPubKey = function() {
	// Find the index of --new_owner
	const newOwnerIndex = process.argv.indexOf("--new_owner");

	// Check if --new_owner is present and has a value
	if(newOwnerIndex < 0 || newOwnerIndex + 1 >= process.argv.length) {
		console.error("New Owner: --new_owner is not provided, or its value is missing");
		process.exit(1);
	}

	const newOwner = process.argv[newOwnerIndex + 1];
	console.log("New Owner: %o", newOwner);
	return new PublicKey(newOwner);

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
	const ctx = { // struct ATransferOwnership<'info>
		accounts: {
			owner: deployerKey.publicKey,
			mainState: new PublicKey(mainStateKey),
		},
		signers: [deployerKey],
	};
	const tx = await program.rpc.transferOwnership(newOwnerPubKey, ctx);
	console.log("Ownership transferred to %s: %o", newOwnerPubKey, tx);
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
