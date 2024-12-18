const {load_sol_keypair_from_env, load_program_name_param} = require("./utils");
const fs = require("fs");
const path = require("path");

// read the environment variables from .env file
require("dotenv").config();

// check if there is a key or mnemonic available in the environment
if(!process.env.SOL_KEY && !process.env.MNEMONIC) {
	console.error("Neither SOL_KEY nor MNEMONIC is set. Nothing to import.");
	process.exit(1);
}

const solKeypair = load_sol_keypair_from_env();

fs.writeFileSync(path.resolve(__dirname, "../p_key_solana"), JSON.stringify(Array.from(solKeypair.secretKey)));
console.log("Private Key saved to p_key_solana file. Remember to delete this file after.");

// update the DEFAULT_OWNER in the "../programs/pump_fun/src/constants.rs" source file
if(process.argv.indexOf("--update_default_owner") >= 0) {
	const programName = load_program_name_param();
	const constantsFilePath = path.join(__dirname, `../programs/${programName}/src/constants.rs`);

	let data = fs.readFileSync(constantsFilePath, "utf8");
	const defaultOwnerAddressPattern = /pub const DEFAULT_OWNER: &'static str = "[1-9A-HJ-NP-Za-km-z]{44}";/;
	if(!defaultOwnerAddressPattern.test(data)) {
		throw "Cannot update DEFAULT_OWNER: pattern not found!";
	}
	const updatedData = data.replace(defaultOwnerAddressPattern, `pub const DEFAULT_OWNER: &'static str = "${solKeypair.publicKey}";`);
	if(updatedData !== data) {
		fs.writeFileSync(constantsFilePath, updatedData, "utf8");
		console.log("DEFAULT_OWNER in constants.rs updated to %s", solKeypair.publicKey);
	}
	else {
		console.log("DEFAULT_OWNER in constants.rs wasn't updated. It is already set to %s", solKeypair.publicKey);
	}
}
