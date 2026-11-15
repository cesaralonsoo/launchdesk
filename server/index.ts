import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { config } from "./config.js";
import { migrate } from "./db.js";
import { resumePending } from "./jobs.js";
import { bchUsdOrZero } from "./price.js";
import { seedExample } from "./seed/example.js";

await migrate();
await resumePending();
// F2: the free, read-only example pack (/p/example). A seed failure must never keep the server down.
await seedExample().catch((e) => console.warn("[seed] example pack:", (e as Error).message));
void bchUsdOrZero(); // warm the price cache
serve({ fetch: app.fetch, port: config.port }, (i) => console.log(`LaunchDesk API on http://localhost:${i.port}`));
