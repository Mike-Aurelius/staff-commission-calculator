import { ShopifyOrder, StaffCommission } from "./types";
import { extractStaffFromOrder } from "./shopify";

/** Store leads are excluded from commission calculations */
export const EXCLUDED_STAFF = new Set(["Lexx", "Najwa", "Angela"]);

/** Commission floor — orders below this earn nothing */
const FLOOR = 65;

interface Tier {
  min: number;
  max: number;
  rate: number;
  label: string;
}

const TIERS: Tier[] = [
  { min: 65, max: 74.99, rate: 0.05, label: "$65–$74.99 (5%)" },
  { min: 75, max: 84.99, rate: 0.10, label: "$75–$84.99 (10%)" },
  { min: 85, max: Infinity, rate: 0.15, label: "$85+ (15%)" },
];

function getTier(avgOrderValue: number): Tier | null {
  return TIERS.find((t) => avgOrderValue >= t.min && avgOrderValue <= t.max) ?? null;
}

/**
 * Groups orders by staff member, skipping unattributed orders and
 * excluded store leads, then calculates tiered commission for each.
 *
 * Commission formula:
 *   rate × (avgOrderValue − $65) × orderCount
 *
 * Where `rate` is determined by where the staff member's average order
 * value falls within the tier table.
 */
export function calculateCommissions(orders: ShopifyOrder[]): StaffCommission[] {
  // Group orders by staff name
  const staffOrders = new Map<string, ShopifyOrder[]>();

  for (const order of orders) {
    const name = extractStaffFromOrder(order);
    if (!name) continue;
    if (EXCLUDED_STAFF.has(name)) continue;

    if (!staffOrders.has(name)) staffOrders.set(name, []);
    staffOrders.get(name)!.push(order);
  }

  // Calculate commission for each staff member
  const results: StaffCommission[] = [];

  for (const [name, staffOrderList] of staffOrders.entries()) {
    const orderCount = staffOrderList.length;
    const totalSales = staffOrderList.reduce(
      (sum, o) => sum + parseFloat(o.total_price),
      0
    );
    const avgOrderValue = totalSales / orderCount;
    const tier = getTier(avgOrderValue);

    if (!tier) {
      // Average order value is below the $65 floor — no commission
      results.push({
        name,
        orderCount,
        totalSales,
        avgOrderValue,
        tier: `Below $${FLOOR} (0%)`,
        commissionRate: 0,
        commissionBase: 0,
        commissionAmount: 0,
      });
      continue;
    }

    const commissionBase = avgOrderValue - FLOOR;
    const commissionAmount = tier.rate * commissionBase * orderCount;

    results.push({
      name,
      orderCount,
      totalSales,
      avgOrderValue,
      tier: tier.label,
      commissionRate: tier.rate,
      commissionBase,
      commissionAmount,
    });
  }

  // Sort by commission amount descending
  return results.sort((a, b) => b.commissionAmount - a.commissionAmount);
}
