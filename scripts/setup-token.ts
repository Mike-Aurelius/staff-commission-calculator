/**
 * One-time Shopify OAuth setup script.
 *
 * Run this once to authorize your Partner Dashboard app against your store
 * and save a permanent offline access token to .env.  You never need to
 * run it again unless you revoke the app.
 *
 * Prerequisites (do these first):
 *   1. In your Partner Dashboard → Apps → your app → App setup →
 *      "App URL" section → add  http://localhost:3000/callback
 *      as an "Allowed redirection URL" and save.
 *   2. Make sure SHOPIFY_STORE_URL, SHOPIFY_CLIENT_ID, and
 *      SHOPIFY_CLIENT_SECRET are set in your .env file.
 *
 * Usage:
 *   npm run setup-token
 */

import "dotenv/config";
import http from "http";
import { URL } from "url";
import crypto from "crypto";
import fs from "fs";
import path from "path";

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = "read_orders";

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}. Add it to your .env file.`);
  return v;
}

const storeUrl = requireEnv("SHOPIFY_STORE_URL");
const clientId = requireEnv("SHOPIFY_CLIENT_ID");
const clientSecret = requireEnv("SHOPIFY_CLIENT_SECRET");

// ─── OAuth flow ───────────────────────────────────────────────────────────────

const state = crypto.randomBytes(16).toString("hex");

const authUrl =
  `https://${storeUrl}/admin/oauth/authorize?` +
  new URLSearchParams({
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state,
  }).toString();

console.log("\n─────────────────────────────────────────────────────────");
console.log(" Shopify OAuth Setup");
console.log("─────────────────────────────────────────────────────────");
console.log("\nStep 1 — Open this URL in your browser:\n");
console.log(" ", authUrl);
console.log("\nStep 2 — Click \"Install\" to authorize the app.");
console.log("\nWaiting for Shopify to redirect back...\n");

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const params = new URL(req.url, `http://localhost:${PORT}`).searchParams;
  const code = params.get("code");
  const returnedState = params.get("state");
  const error = params.get("error");

  if (error) {
    const msg = `Shopify returned an error: ${error} — ${params.get("error_description") ?? ""}`;
    console.error(msg);
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`<h1>Error</h1><p>${msg}</p>`);
    server.close();
    process.exit(1);
  }

  if (returnedState !== state) {
    const msg = "State mismatch — possible CSRF. Aborting.";
    console.error(msg);
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`<h1>Error</h1><p>${msg}</p>`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    const msg = "No authorization code received from Shopify.";
    console.error(msg);
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`<h1>Error</h1><p>${msg}</p>`);
    server.close();
    process.exit(1);
  }

  // Exchange authorization code for permanent offline access token
  let accessToken: string;
  try {
    const tokenRes = await fetch(`https://${storeUrl}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      throw new Error(`Token exchange failed ${tokenRes.status}: ${body}`);
    }

    const data = (await tokenRes.json()) as { access_token: string; scope: string };
    accessToken = data.access_token;
    console.log(`✓ Token received  (scopes: ${data.scope})`);
  } catch (err) {
    const msg = String(err);
    console.error("Token exchange error:", msg);
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(`<h1>Error</h1><p>${msg}</p>`);
    server.close();
    process.exit(1);
  }

  // Write token into .env
  const envPath = path.resolve(process.cwd(), ".env");

  if (!fs.existsSync(envPath)) {
    console.error(".env file not found. Create it from .env.example first.");
    process.exit(1);
  }

  let envContent = fs.readFileSync(envPath, "utf8");

  if (/^SHOPIFY_ACCESS_TOKEN=.*/m.test(envContent)) {
    // Replace existing placeholder or old value
    envContent = envContent.replace(/^SHOPIFY_ACCESS_TOKEN=.*/m, `SHOPIFY_ACCESS_TOKEN=${accessToken}`);
  } else {
    // Append if missing
    envContent += `\nSHOPIFY_ACCESS_TOKEN=${accessToken}\n`;
  }

  fs.writeFileSync(envPath, envContent, "utf8");

  console.log("✓ SHOPIFY_ACCESS_TOKEN saved to .env");
  console.log("\n─────────────────────────────────────────────────────────");
  console.log(" Setup complete! You can now run:  npm run run-now");
  console.log("─────────────────────────────────────────────────────────\n");

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`
    <!DOCTYPE html>
    <html>
      <head><title>Shopify OAuth Setup</title></head>
      <body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;">
        <h1 style="color:#059669;">&#10003; Setup complete</h1>
        <p>Your access token has been saved to <code>.env</code>.</p>
        <p>You can close this window and return to your terminal.</p>
      </body>
    </html>
  `);

  server.close();
});

server.listen(PORT, () => {
  // Server is ready, URL already printed above
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the other process and try again.`);
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});
