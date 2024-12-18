const fs = require("fs");
const path = require("path");
const {Keypair} = require("@solana/web3.js");
const bs58 = require("bs58");
const {load_program_name_from_env} = require("./utils");

const programName = load_program_name_from_env();
const programKeypair = Keypair.fromSecretKey(Uint8Array.from(require(`../target/deploy/${programName}-keypair.json`)));
console.log("Program keypair loaded: %s (public key)", programKeypair.publicKey);

fs.writeFileSync(path.resolve(__dirname, "../program_p_key"), `${bs58.encode(programKeypair.secretKey)}`);
console.log("Program Private Key saved to program_p_key file. Remember to delete this file after.");
