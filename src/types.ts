export interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  total_price: string;
  tags: string;
  note_attributes: Array<{ name: string; value: string }>;
  financial_status: string;
}

export interface ShopifyOrdersResponse {
  orders: ShopifyOrder[];
}

export interface StaffCommission {
  name: string;
  orderCount: number;
  totalSales: number;
  avgOrderValue: number;
  tier: string;
  commissionRate: number;
  commissionBase: number;
  commissionAmount: number;
}
