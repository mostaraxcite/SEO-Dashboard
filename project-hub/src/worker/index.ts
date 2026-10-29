/**
 * Background worker: outbox → notifications/deliveries, email/SMS sending with
 * retries + dead letter, SLA clocks, review-window auto-close, daily digests.
 * Run with `npm run worker`. Safe to run several instances (SKIP LOCKED).
 */
import { loadEnv } from "../../scripts/env";
loadEnv();

const { runWorkerOnce } = await import("../server/notify/worker");
const once = process.argv.includes("--once");
const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 5000);

async function loop() {
  for (;;) {
    try {
      await runWorkerOnce();
    } catch (e) {
      console.error("[worker] tick failed", e);
    }
    if (once) break;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  if (once) {
    const { closeDb } = await import("../server/db");
    await closeDb();
  }
}
console.log(`[worker] started${once ? " (single pass)" : ""}`);
await loop();
