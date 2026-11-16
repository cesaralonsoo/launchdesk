// Last-resort refund, with no server and no database: rebuilds one order's contract from its public parameters and
// prints a signed-by-nobody refund transaction (the refund path needs no key). Nothing is sent: paste the hex into
// any BCH "broadcast transaction" page or `blockchain.transaction.broadcast` yourself, after the timeout has passed.
//
//   npx tsx --env-file=.env contracts/refund-offline.ts \
//     --project <projectId> --refund <customer bitcoincash:q… address> --funding <txid>:<vout>:<sats> \
//     [--merchant <bitcoincash:q…>] [--timeout 6] [--net mainnet|chipnet] [--release-pk <hex> --oracle-pk <hex>]
//
// Public keys come from --release-pk/--oracle-pk (escrow_orders.release_pk / oracle_pk), else from ESCROW_WIF /
// ESCROW_ORACLE_WIF in the environment. The merchant defaults to MERCHANT_ADDRESS. The script prints the contract
// address it rebuilt: it must equal the address the wallet paid, or the parameters are wrong.
import { hexToBin } from "@bitauth/libauth";
import type { NetworkProvider } from "cashscript";
import { buildRefund, makeEscrow, pubsOf, type EscrowNet } from "../server/escrow/contract.js";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ""), process.argv[i + 1] ?? "");
const need = (k: string, v = args.get(k)) => {
  if (!v) throw new Error(`missing --${k}`);
  return v;
};
const net = (args.get("net") ?? process.env.ESCROW_NETWORK ?? "mainnet") === "chipnet" ? "chipnet" : ("mainnet" as EscrowNet);
const [txid, vout, sats] = need("funding").split(":");
const pubs = args.get("release-pk")
  ? { releasePk: hexToBin(need("release-pk")), oraclePk: hexToBin(args.get("oracle-pk") || need("release-pk")) }
  : pubsOf({ releaseWif: need("ESCROW_WIF", process.env.ESCROW_WIF), oracleWif: process.env.ESCROW_ORACLE_WIF || undefined });
// Building and the local VM check need no network: only `network` is read.
const offline = { network: net } as unknown as NetworkProvider;
const escrow = makeEscrow(
  {
    ref: `LD1:${need("project")}:validate`,
    merchantAddress: args.get("merchant") || need("MERCHANT_ADDRESS", process.env.MERCHANT_ADDRESS),
    refundAddress: need("refund"),
    timeoutBlocks: Number(args.get("timeout") ?? process.env.ESCROW_TIMEOUT_BLOCKS ?? 6),
  },
  pubs,
  offline,
);
const tx = buildRefund(escrow, { txid: need("txid", txid), vout: Number(vout), sats: Number(sats) });
console.log(`contract address (must match the paid address): ${escrow.address}`);
console.log(`refund txid: ${tx.txid}`);
console.log(`refund hex (valid once the payment is ${escrow.timeoutBlocks} blocks deep):\n${tx.hex}`);
