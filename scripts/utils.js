const anchor = require("@coral-xyz/anchor");
const {Keypair, PublicKey} = require("@solana/web3.js");
const bip39 = require("bip39");
const bs58 = require("bs58");
const {derivePath} = require("ed25519-hd-key");

const {NATIVE_MINT} = require("@solana/spl-token");
const ALI_MINT = new PublicKey("9wvorGtBJ8gyLorFTmwXWcymPoGVUBn6MRzHwFpCdCeC");

// read the environment variables from .env file
require("dotenv").config();

function load_sol_keypair_from_env() {
	// check if there is a key or mnemonic available in the environment
	if(!process.env.SOL_KEY && !process.env.MNEMONIC) {
		throw "Neither SOL_KEY nor MNEMONIC is set.";
	}

	if(process.env.SOL_KEY) {
		const decoded = bs58.decode(process.env.SOL_KEY);
		if(decoded.length !== 64) {
			throw new Error("Invalid SOL_KEY length. Expected 64 bytes.");
		}
		const key = Keypair.fromSecretKey(decoded);
		console.log("Deployer Key loaded from SOL_KEY: %s (public key)", key.publicKey);
		return key;
	}

	if (!bip39.validateMnemonic(process.env.MNEMONIC)) {
		throw "Invalid MNEMONIC: Not a valid BIP39 phrase.";
	}

	const seed = bip39.mnemonicToSeedSync(process.env.MNEMONIC);
	const solana_path = "m/44'/501'/0'/0'"; // BIP44 path for Solana
	const derivedSeed = derivePath(solana_path, seed.toString("hex")).key;
	const key = Keypair.fromSeed(derivedSeed);
	console.log("Deployer Key loaded from MNEMONIC: %s (public key)", key.publicKey);
	return key;
}

function load_json_rpc_endpoint_from_env() {
	if(process.env.JSON_RPC) {
		console.log("JSON_RPC endpoint is set to %o", process.env.JSON_RPC);
		return process.env.JSON_RPC;
	}

	console.log("JSON_RPC endpoint is not set. Falling back to https://api.mainnet-beta.solana.com");
	return "https://api.mainnet-beta.solana.com";
}

function load_program_id_param() {
	// Find the index of --program_id
	const programIdIndex = process.argv.indexOf("--program_id");

	// Check if --program_id is present and has a value
	if(programIdIndex < 0 || programIdIndex + 1 >= process.argv.length) {
		console.error("Program ID: --program_id is not provided, or its value is missing");
		process.exit(1);
	}

	const programId = process.argv[programIdIndex + 1];
	console.log("Program ID: %o", programId);
	return new PublicKey(programId);
}

function load_program_name_param() {
	// Find the index of --program_name
	const programNameIndex = process.argv.indexOf("--program_name");

	// Check if --program_id is present and has a value
	if(programNameIndex < 0 || programNameIndex + 1 >= process.argv.length) {
		console.error("Program Name: --program_name is not provided, or its value is missing");
		process.exit(1);
	}

	const programName = process.argv[programNameIndex + 1];
	console.log("Program Name: %o", programName);
	return programName;
}

function get_quote_mint(program_name) {
	switch(program_name) {
		case "ali_pump_fun": return ALI_MINT;
		case "pump_fun": return NATIVE_MINT;
		default: throw "Unknown program " + program_name;
	}
}

function get_main_state_defaults(program_name) {
	switch(program_name) {
		case "ali_pump_fun": return {
			tradingFee: new anchor.BN(1000), // 1%
			totalSupply: new anchor.BN(1_000_000_000_000_000), // 1 billion token
			initVirtBaseReserves: new anchor.BN(66_666_666_000_000), // ~6.6666666% of total supply
			initVirtQuoteReserves: new anchor.BN(100_000_00_000_000), // 100k ALI
			realQuoteThreshold: new anchor.BN(300_000_00_000_000), // +300k ALI
		};
		case "pump_fun": return {
			tradingFee: new anchor.BN(1000), // 1%
			totalSupply: new anchor.BN(1_000_000_000_000_000), // 1 billion token
			initVirtBaseReserves: new anchor.BN(63_529_411_764_705), // ~6.353% of total supply
			initVirtQuoteReserves: new anchor.BN(28_000_000_000), // 28 SOL
			realQuoteThreshold: new anchor.BN(85_000_000_000), // +85 SOL
		};
		default: throw "Unknown program " + program_name;
	}
}

function print_obj(obj) {
	// Helper function to check if a value is a primitive
	function isPrimitive(val) {
		return (val !== Object(val));
	}

	// Recursive function to convert object properties
	function convert(obj) {
		const result = {};
		for(const key in obj) {
			if(obj.hasOwnProperty(key)) {
				const value = obj[key];
				if(isPrimitive(value)) {
					result[key] = value;
				}
				else if(typeof value.toString === 'function') {
					result[key] = value.toString();
				}
				else if(typeof value === 'object') {
					result[key] = convert(value);
				}
				else {
					result[key] = value;
				}
			}
		}
		return result;
	}

	return convert(obj);
}


module.exports = {
	load_sol_keypair_from_env,
	load_json_rpc_endpoint_from_env,
	load_program_id_param,
	load_program_name_param,
	get_quote_mint,
	get_main_state_defaults,
	print_obj,
}
