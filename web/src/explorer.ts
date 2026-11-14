// The one block explorer used everywhere (office ledger, pack receipt).
export const explorerTx = (txid: string) => `https://blockchair.com/bitcoin-cash/transaction/${encodeURIComponent(txid)}`;
