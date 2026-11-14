import { CashAddressType, decodeCashAddress, encodeCashAddress } from "@bitauth/libauth";

/**
 * Validates a mainnet P2PKH cashaddr (with or without the "bitcoincash:" prefix)
 * and returns it normalised as "bitcoincash:q...". Throws a user-facing error otherwise.
 */
export function normalizeFounderAddress(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) throw new Error("Connect your wallet first: we need your address for the pre-order QR.");
  let a = input.trim().toLowerCase();
  if (!a.includes(":")) a = "bitcoincash:" + a;
  const d = decodeCashAddress(a);
  if (typeof d === "string" || d.prefix !== "bitcoincash") throw new Error("That is not a valid Bitcoin Cash address.");
  if (d.type !== CashAddressType.p2pkh) throw new Error("Please use a standard Bitcoin Cash address (starting with q).");
  const enc = encodeCashAddress({ prefix: "bitcoincash", type: "p2pkh", payload: d.payload });
  return typeof enc === "string" ? enc : enc.address;
}
