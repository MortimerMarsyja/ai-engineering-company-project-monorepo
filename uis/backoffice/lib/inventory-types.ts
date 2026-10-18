// ── Inventory types matching the API schemas (services/api/app/models/schemas.py) ──

export type Country = "Colombia" | "United States";
export type City = "Medellín" | "Bogotá" | "Cali" | "Miami" | "Orlando";

export type ProductCategory =
  | "Meat"
  | "Produce"
  | "Beverages"
  | "Dairy"
  | "Seafood"
  | "Spices"
  | "Other";

export type ExitReason = "kitchen_use" | "waste" | "transfer" | "other";

export type OrderType = "inbound" | "outbound";

export interface Product {
  id: number;
  name: string;
  sku: string;
  category: ProductCategory;
  country: Country;
  city: City | null;
  price_cop: number;
  price_usd: number;
  dietary_preferences: string[];
  is_available: boolean;
  current_stock: number;
  created_at: string;
  updated_at: string;
}

export interface InboundOrderCreate {
  ingredient_id: number;
  quantity: number;
  unit: string;
  supplier_id?: number | null;
  country: Country;
  city: City | null;
}

export interface OutboundOrderCreate {
  ingredient_id: number;
  quantity: number;
  unit: string;
  reason: ExitReason;
  country: Country;
  city: City | null;
}

export interface Order {
  id: number;
  order_type: OrderType;
  ingredient_id: number;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit: string;
  user_uuid: string;
  country: Country;
  city: City | null;
  created_at: string;
  supplier_id?: number | null;
  reason?: ExitReason | null;
}
