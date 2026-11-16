// Prints a fresh escrow server key for .env (ESCROW_WIF). Run it yourself; never paste the WIF in chat or commit it.
//   node contracts/keygen.mjs            -> mainnet WIF
//   node contracts/keygen.mjs chipnet    -> testnet WIF
import { randomBytes } from "node:crypto";
import { binToHex, encodePrivateKeyWif, secp256k1 } from "@bitauth/libauth";

const net = process.argv[2] === "chipnet" ? "testnet" : "mainnet";
let priv;
do priv = Uint8Array.from(randomBytes(32));
while (!secp256k1.validatePrivateKey(priv));
console.log(`ESCROW_WIF=${encodePrivateKeyWif(priv, net)}`);
console.log(`# public key (safe to share): ${binToHex(secp256k1.derivePublicKeyCompressed(priv))}`);
