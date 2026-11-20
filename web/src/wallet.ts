import {
  cashAddressToLockingBytecode,
  encodeCashAddress,
  hash160,
  hexToBin,
  utf8ToBin,
} from "@bitauth/libauth";
import { initiateDappRelay, type DappRelayResult } from "@wizardconnect/core";
import { sourceOutputToRelay, transactionToHex } from "@wizardconnect/core/hdwalletv1-serialize";
import { DappConnectionManager } from "@wizardconnect/dapp";
import qrcode from "qrcode-generator";
import { connectElectrum } from "./electrum";

const KEY = "launchdesk-wc";
export const mgr = new DappConnectionManager("LaunchDesk", location.origin + "/icon.svg", { session: { key: KEY } });
let relay: DappRelayResult | null = null;

export type WalletState = "idle" | "pairing" | "connecting" | "ready";
type Listener = (s: WalletState) => void;
const listeners = new Set<Listener>();
let state: WalletState = "idle";
const setState = (s: WalletState) => {
  state = s;
  listeners.forEach((l) => l(s));
};
export const onWallet = (l: Listener) => (listeners.add(l), () => listeners.delete(l));
export const walletState = () => state;
export const walletName = () => mgr.walletName || "your wallet";

mgr.on("walletready", () => setState("ready"));
mgr.on("disconnect", () => {
  mgr.clearStoredSession();
  relay?.cleanup();
  relay = null;
  setState("idle");
});

const attach = (existing?: { privateKey: string; secret: string; walletPublicKey: string }) => {
  // The manager attaches its message listener only to the first relay client it sees. A fresh relay
  // (re-pairing after a disconnect) has a new client, so let the manager attach to that one too.
  (mgr as unknown as { listenerAttached: boolean }).listenerAttached = false;
  relay = initiateDappRelay((p) => mgr.updateConnection(p.client, p.status), existing ? { existingCredentials: existing } : undefined);
  mgr.attachRelay(relay);
  return relay;
};

/** Reconnects a saved session silently. Returns true if there was one. */
export function resume(): boolean {
  const s = mgr.loadStoredSession();
  if (!s?.walletPublicKey) return false;
  try {
    attach({ privateKey: s.privateKey, secret: s.secret, walletPublicKey: s.walletPublicKey });
    setState("connecting");
    return true;
  } catch {
    mgr.clearStoredSession();
    return false;
  }
}

/** Starts a fresh pairing and returns the deep link + QR code. */
let pending: { uri: string; qrSvg: string } | null = null;
export function pair(): { uri: string; qrSvg: string } {
  // Reopening the pay dialog keeps the same QR: a wallet that is mid-scan still lands on this session.
  if (state === "pairing" && relay && pending) return pending;
  relay?.cleanup();
  const r = attach();
  const qr = qrcode(0, "M");
  qr.addData(r.qrUri, "Alphanumeric");
  qr.make();
  setState("pairing");
  pending = { uri: r.uri, qrSvg: qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true }) };
  return pending;
}

/**
 * F9: drops an unfinished pairing (the dialog was closed before a wallet connected). Without this the relay
 * keeps waiting and logs "Key exchange timed out" minutes later. A connected or reconnecting wallet is kept.
 */
export function cancelPairing() {
  if (state !== "pairing") return;
  relay?.cleanup();
  relay = null;
  pending = null;
  setState("idle");
}

/** Seconds a pairing code stays useful before "New code" (the relay's key exchange gives up after that). */
export const PAIRING_TTL_S = 120;

/** Forces a fresh pairing code ("New code"). */
export function newPairing(): { uri: string; qrSvg: string } {
  if (state === "pairing") {
    relay?.cleanup();
    relay = null;
    pending = null;
    setState("idle");
  }
  return pair();
}

export async function disconnect() {
  await mgr.sendDisconnect("bye").catch(() => {});
  mgr.clearStoredSession();
  relay?.cleanup();
  relay = null;
  setState("idle");
}

// ---------- payments ----------

const RECEIVE = 0;
const CHANGE = 1;
const PATH_NAME: Record<number, string> = { 0: "receive", 1: "change" };

function addressAt(child: number, index: number) {
  const pk = mgr.getPubkey(child, BigInt(index));
  if (!pk) throw new Error("Wallet not ready");
  return encodeCashAddress({ prefix: "bitcoincash", type: "p2pkh", payload: hash160(pk) }).address;
}
function lockingOf(addr: string) {
  const r = cashAddressToLockingBytecode(addr);
  if (typeof r === "string") throw new Error(r);
  return r.bytecode;
}
function opReturn(text: string) {
  const data = utf8ToBin(text);
  if (data.length > 75) throw new Error("tag too long");
  return Uint8Array.from([0x6a, data.length, ...data]);
}

type Utxo = { tx_hash: string; tx_pos: number; value: number; child: number; index: number; addr: string };

/** Addresses scanned per batch; scanning stops after a whole batch with no history (the usual HD gap limit). */
const GAP = 20;
const MAX_INDEX = 1000;

/**
 * Finds spendable BCH (no tokens) on the receive and change chains. Like a wallet's own sync, it keeps
 * scanning in batches until GAP addresses in a row have never been used, so long-used wallets whose coins
 * sit on later addresses are still found.
 */
async function findUtxos(): Promise<Utxo[]> {
  const el = await connectElectrum();
  try {
    const scanChain = async (child: number) => {
      const out: Utxo[] = [];
      let lastUsed = -1;
      for (let start = 0; start < MAX_INDEX && start <= lastUsed + GAP; start += GAP) {
        const batch = await Promise.all(
          Array.from({ length: GAP }, async (_, k) => {
            const index = start + k;
            const addr = addressAt(child, index);
            const [hist, list] = await Promise.all([
              el.call<any[]>("blockchain.address.get_history", [addr]).catch(() => [] as any[]),
              el.call<any[]>("blockchain.address.listunspent", [addr, "exclude_tokens"]),
            ]);
            const utxos = list.map((u) => ({ tx_hash: u.tx_hash, tx_pos: u.tx_pos, value: u.value, child, index, addr }));
            return { index, used: hist.length > 0 || list.length > 0, utxos };
          }),
        );
        for (const r of batch) {
          if (r.used) lastUsed = Math.max(lastUsed, r.index);
          out.push(...r.utxos);
        }
      }
      return out;
    };
    const [receive, change] = await Promise.all([scanChain(RECEIVE), scanChain(CHANGE)]);
    return [...receive, ...change];
  } finally {
    el.close();
  }
}

/**
 * Builds a transaction paying `sats` to `payTo` with an OP_RETURN `tag`,
 * asks the wallet to sign it (it is NOT broadcast by the wallet), and returns the signed hex.
 * The server checks it and broadcasts it.
 */
export async function payWithWallet(payTo: string, sats: number, tag: string, prompt: string, signal?: AbortSignal) {
  if (state !== "ready") throw new Error("Connect your wallet first");
  const utxos = await findUtxos();
  if (signal?.aborted) throw new Error("Payment cancelled");
  const feeFor = (n: number) => 10 + 148 * n + 34 * 2 + 9 + tag.length + 20;
  const pick: Utxo[] = [];
  let total = 0;
  for (const u of [...utxos].sort((a, b) => b.value - a.value)) {
    pick.push(u);
    total += u.value;
    if (total >= sats + feeFor(pick.length)) break;
  }
  const change = total - sats - feeFor(pick.length);
  if (change < 0) throw new Error("Not enough BCH in this wallet for this payment");

  const inputs = pick.map((u) => ({
    outpointTransactionHash: hexToBin(u.tx_hash),
    outpointIndex: u.tx_pos,
    sequenceNumber: 0xffffffff,
    unlockingBytecode: new Uint8Array(),
  }));
  const outputs = [
    { lockingBytecode: lockingOf(payTo), valueSatoshis: BigInt(sats) },
    { lockingBytecode: opReturn(tag), valueSatoshis: 0n },
  ];
  if (change >= 546) outputs.push({ lockingBytecode: lockingOf(addressAt(CHANGE, 0)), valueSatoshis: BigInt(change) });

  const sourceOutputs = pick.map((u, i) =>
    sourceOutputToRelay({ ...inputs[i], valueSatoshis: BigInt(u.value), lockingBytecode: lockingOf(u.addr) }),
  );
  const res = await mgr.signTransaction(
    {
      transaction: { transaction: transactionToHex(inputs, outputs), sourceOutputs, broadcast: false, userPrompt: prompt } as any,
      inputPaths: pick.map((u, i) => [i, PATH_NAME[u.child], u.index] as [number, string, number]),
    },
    { signal },
  );
  if (res.error) throw new Error(res.error);
  if (!res.signedTransaction) throw new Error("The wallet did not return a signed transaction");
  return res.signedTransaction;
}

/** The connected wallet's first receive address (used as the founder's payout address). */
export const receiveAddress = () => addressAt(RECEIVE, 0);
