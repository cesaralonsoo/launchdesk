// Run: npx tsx test/payment.test.ts
import assert from "node:assert/strict";
import { cashAddressToLockingBytecode, encodeTransaction, binToHex, utf8ToBin, hexToBin } from "@bitauth/libauth";
process.env.MERCHANT_ADDRESS = "bitcoincash:qp9d679zvayvudj65nd9zlgezvjplr8g3vea64wad0";
const { checkPaymentTx } = await import("../server/chain.js");

const lock = (a: string) => (cashAddressToLockingBytecode(a) as any).bytecode as Uint8Array;
const opret = (t: string) => { const d = utf8ToBin(t); return Uint8Array.from([0x6a, d.length, ...d]); };
const tx = (outs: Array<[Uint8Array, bigint]>) =>
  binToHex(encodeTransaction({
    version: 2, locktime: 0,
    inputs: [{ outpointTransactionHash: hexToBin("11".repeat(32)), outpointIndex: 0, sequenceNumber: 0xffffffff, unlockingBytecode: new Uint8Array() }],
    outputs: outs.map(([lockingBytecode, valueSatoshis]) => ({ lockingBytecode, valueSatoshis })),
  }));
const M = lock(process.env.MERCHANT_ADDRESS);
const OTHER = Uint8Array.from([0x76, 0xa9, 0x14, ...new Uint8Array(20).fill(7), 0x88, 0xac]);
const TAG = "LD1:abc:validate";

const ok = checkPaymentTx(tx([[M, 50000n], [opret(TAG), 0n]]), 49500, TAG);
assert.equal(ok.paidSats, 50000);
assert.match(ok.txid, /^[0-9a-f]{64}$/);
assert.throws(() => checkPaymentTx(tx([[M, 40000n], [opret(TAG), 0n]]), 49500, TAG), /too small/);
assert.throws(() => checkPaymentTx(tx([[OTHER, 50000n], [opret(TAG), 0n]]), 49500, TAG), /too small/);
assert.throws(() => checkPaymentTx(tx([[M, 50000n], [opret("LD1:other:validate"), 0n]]), 49500, TAG), /not tagged/);
assert.throws(() => checkPaymentTx(tx([[M, 50000n]]), 49500, TAG), /not tagged/);
assert.throws(() => checkPaymentTx("zz", 1, TAG), /Invalid/);
console.log("payment checks: all passed");
