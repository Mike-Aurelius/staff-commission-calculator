import "dotenv/config";
import cron from "node-cron";
import { fetchOrdersForPeriod, getPreviousMonthRange } from "./shopify";
import { calculateCommissions } from "./commission";
import { sendCommissionEmail } from "./email";

// ─── Config ─────────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function getConfig() {
  return {
    shopifyStoreUrl: requireEnv("SHOPIFY_STORE_URL"),         // e.g. my-store.myshopify.com
    shopifyAccessToken: requireEnv("SHOPIFY_ACCESS_TOKEN"),   // Admin API access token
    resendApiKey: requireEnv("RESEND_API_KEY"),
    emailFrom: requireEnv("EMAIL_FROM"),                      // e.g. reports@yourdomain.com
    emailTo: requireEnv("EMAIL_TO"),                          // Amber's email
  };
}

// ─── Core job ────────────────────────────────────────────────────────────────

async function runCommissionReport(): Promise<void> {
  console.log("[commission] Starting monthly commission report...");

  const config = getConfig();
  const { start, end, label } = getPreviousMonthRange();

  console.log(`[commission] Fetching orders for ${label} (${start.toISOString()} → ${end.toISOString()})`);

  const orders = await fetchOrdersForPeriod(
    config.shopifyStoreUrl,
    config.shopifyAccessToken,
    start,
    end
  );

  console.log(`[commission] Fetched ${orders.length} paid orders`);

  const commissions = calculateCommissions(orders);

  if (commissions.length === 0) {
    console.log("[commission] No attributed orders found — skipping email");
    return;
  }

  console.log(`[commission] Calculated commissions for ${commissions.length} staff members:`);
  for (const c of commissions) {
    console.log(`  ${c.name.padEnd(20)} ${c.orderCount} orders  avg ${c.avgOrderValue.toFixed(2)}  ${c.tier}  → $${c.commissionAmount.toFixed(2)}`);
  }

  await sendCommissionEmail(
    config.resendApiKey,
    config.emailFrom,
    config.emailTo,
    label,
    commissions
  );
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const runNow = process.argv.includes("--run-now");

if (runNow) {
  // Useful for testing or manually triggering outside the schedule
  runCommissionReport().catch((err) => {
    console.error("[commission] Fatal error:", err);
    process.exit(1);
  });
} else {
  // Schedule: 9:00 AM on the 1st of every month
  // Cron: minute hour day-of-month month day-of-week
  const schedule = "0 9 1 * *";

  console.log(`[commission] Scheduler started — will run at 9:00 AM on the 1st of each month (${schedule})`);

  cron.schedule(schedule, () => {
    runCommissionReport().catch((err) => {
      console.error("[commission] Error during scheduled run:", err);
    });
  });
}
