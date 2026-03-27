import { ShopifyOrder, ShopifyOrdersResponse } from "./types";

// ─── OAuth client credentials ─────────────────────────────────────────────────

interface OAuthTokenResponse {
  access_token: string;
  expires_in: number; // seconds
  token_type: string;
}

interface TokenCache {
  token: string;
  expiresAt: number; // ms epoch
}

let tokenCache: TokenCache | null = null;

/**
 * Exchanges a Partner Dashboard app's Client ID + Client Secret for a
 * short-lived Admin API access token using Shopify's OAuth client
 * credentials grant.
 *
 * The token is cached in memory and automatically refreshed 5 minutes
 * before it expires, so repeated calls within a run are cheap.
 */
export async function getAccessToken(
  storeUrl: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const now = Date.now();
  const refreshBufferMs = 5 * 60 * 1000; // refresh 5 min before expiry

  if (tokenCache && tokenCache.expiresAt - refreshBufferMs > now) {
    return tokenCache.token;
  }

  const response = await fetch(
    `https://${storeUrl}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Shopify OAuth token exchange failed ${response.status}: ${body}`);
  }

  const data = (await response.json()) as OAuthTokenResponse;
  tokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return tokenCache.token;
}

// ─── Order fetching ───────────────────────────────────────────────────────────

/**
 * Fetches all paid orders from Shopify for a given date range.
 * Obtains a fresh OAuth token via client credentials before each run,
 * then uses cursor-based pagination to retrieve every order.
 */
export async function fetchOrdersForPeriod(
  storeUrl: string,
  clientId: string,
  clientSecret: string,
  startDate: Date,
  endDate: Date
): Promise<ShopifyOrder[]> {
  const accessToken = await getAccessToken(storeUrl, clientId, clientSecret);

  const allOrders: ShopifyOrder[] = [];
  let pageInfo: string | null = null;
  const limit = 250;

  const createdAtMin = startDate.toISOString();
  const createdAtMax = endDate.toISOString();

  // Only count paid orders so commission reflects real revenue
  const baseParams = new URLSearchParams({
    limit: String(limit),
    status: "any",
    financial_status: "paid",
    created_at_min: createdAtMin,
    created_at_max: createdAtMax,
    fields: "id,name,created_at,total_price,tags,note_attributes,financial_status",
  });

  const baseUrl = `https://${storeUrl}/admin/api/2024-01/orders.json`;

  while (true) {
    const url = pageInfo
      ? `${baseUrl}?limit=${limit}&page_info=${pageInfo}`
      : `${baseUrl}?${baseParams.toString()}`;

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Shopify API error ${response.status}: ${body}`
      );
    }

    const data = (await response.json()) as ShopifyOrdersResponse;
    allOrders.push(...data.orders);

    // Parse Link header for cursor pagination
    const linkHeader = response.headers.get("Link");
    const nextMatch = linkHeader?.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    if (nextMatch) {
      pageInfo = nextMatch[1];
    } else {
      break;
    }
  }

  return allOrders;
}

/**
 * Extracts the staff member name from an order.
 *
 * Attribution strategy (in priority order):
 *  1. A tag in the format "staff:Name"  (e.g. "staff:amber")
 *  2. A note_attribute whose name is "Sales Associate", "Staff", or "staff"
 *
 * Returns null if no attribution is found.
 */
export function extractStaffFromOrder(order: ShopifyOrder): string | null {
  // 1. Check tags for "staff:Name" pattern
  const tags = order.tags
    .split(",")
    .map((t) => t.trim().toLowerCase());

  for (const tag of tags) {
    if (tag.startsWith("staff:")) {
      const name = tag.slice("staff:".length).trim();
      if (name) return toTitleCase(name);
    }
  }

  // 2. Check note_attributes for common sales-associate field names
  const staffAttributeKeys = ["sales associate", "staff", "sales_associate", "associate"];
  for (const attr of order.note_attributes) {
    if (staffAttributeKeys.includes(attr.name.toLowerCase())) {
      const name = attr.value.trim();
      if (name) return toTitleCase(name);
    }
  }

  return null;
}

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
}

/**
 * Returns date range for the previous calendar month.
 */
export function getPreviousMonthRange(): { start: Date; end: Date; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1); // exclusive upper bound

  const label = start.toLocaleString("default", { month: "long", year: "numeric" });
  return { start, end, label };
}
