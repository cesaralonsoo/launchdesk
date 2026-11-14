import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { config } from "./config.js";
import { migrate } from "./db.js";
import { resumePending } from "./jobs.js";
import { bchUsdOrZero } from "./price.js";

await migrate();
await resumePending();
void bchUsdOrZero(); // warm the price cache
serve({ fetch: app.fetch, port: config.port }, (i) => console.log(`LaunchDesk API on http://localhost:${i.port}`));
