import type { Order } from "@/lib/inventory-types";
import { EXIT_REASON_LABELS } from "@/lib/inventory-api";
import Badge from "../Badge";

export interface OrdersTableProps {
  orders: Order[];
}

export default function OrdersTable({ orders }: OrdersTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Quantity</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Detail</th>
              <th className="px-4 py-3 font-medium">Logged by</th>
              <th className="px-4 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {orders.map((order) => (
              <tr key={`${order.order_type}-${order.id}`}>
                <td className="px-4 py-3">
                  <Badge
                    label={order.order_type === "inbound" ? "Delivery" : "Exit"}
                    className={
                      order.order_type === "inbound"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-900">{order.product_name}</div>
                  <div className="text-xs text-zinc-500">{order.product_sku}</div>
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  {order.quantity} {order.unit}
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  {[order.city, order.country].filter(Boolean).join(", ")}
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  {order.order_type === "inbound"
                    ? order.supplier_id
                      ? `Supplier #${order.supplier_id}`
                      : "—"
                    : (order.reason && EXIT_REASON_LABELS[order.reason]) || "—"}
                </td>
                <td className="px-4 py-3 text-zinc-700">{order.user_uuid}</td>
                <td className="px-4 py-3 text-zinc-500">
                  {new Date(order.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {orders.length === 0 && (
        <div className="px-4 py-12 text-center text-sm text-zinc-500">
          No orders found.
        </div>
      )}
    </div>
  );
}
