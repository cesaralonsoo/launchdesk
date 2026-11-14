// Tiny Electrum/Fulcrum JSON-RPC client over WebSocket, with failover.
const SERVERS = ["wss://bch.imaginary.cash:50004", "wss://fulcrum.pat.mn:50004", "wss://electroncash.dk:50004"];

export type Electrum = { call<T = any>(method: string, params: unknown[]): Promise<T>; close(): void };

const CALL_MS = 10_000;

function open(url: string): Promise<Electrum> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map<number, { ok: (v: any) => void; ko: (e: Error) => void }>();
    const close = () => {
      if (ws.readyState < 2) ws.close();
    };
    const t = setTimeout(() => {
      close();
      reject(new Error("timeout " + url));
    }, 8000);
    ws.onerror = () => {
      clearTimeout(t);
      reject(new Error("cannot reach " + url));
    };
    ws.onclose = () => {
      clearTimeout(t);
      pending.forEach((p) => p.ko(new Error("connection closed")));
      pending.clear();
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data as string);
      const p = m.id != null && pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      m.error ? p.ko(new Error(m.error.message ?? "electrum error")) : p.ok(m.result);
    };
    ws.onopen = () => {
      clearTimeout(t);
      resolve({
        call: (method, params) =>
          new Promise((ok, ko) => {
            const i = ++id;
            // A stalled server must never leave the payment hanging on "Approve in your wallet".
            const timer = setTimeout(() => {
              pending.delete(i);
              ko(new Error("The Bitcoin Cash server did not answer in time."));
            }, CALL_MS);
            pending.set(i, {
              ok: (v) => (clearTimeout(timer), ok(v)),
              ko: (e) => (clearTimeout(timer), ko(e)),
            });
            if (ws.readyState !== 1) return pending.get(i)!.ko(new Error("connection closed"));
            ws.send(JSON.stringify({ jsonrpc: "2.0", id: i, method, params }));
          }),
        close,
      });
    };
  });
}

export async function connectElectrum(): Promise<Electrum> {
  let last: unknown;
  for (const url of SERVERS) {
    let c: Electrum | null = null;
    try {
      c = await open(url);
      await c.call("server.version", ["LaunchDesk", "1.5"]);
      return c;
    } catch (e) {
      c?.close(); // a failed handshake must not leak the socket
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("No BCH server reachable");
}
