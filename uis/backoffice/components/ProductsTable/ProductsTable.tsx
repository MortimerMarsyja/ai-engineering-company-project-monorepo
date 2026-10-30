import Link from "next/link";
import type { Product } from "@/lib/inventory-types";
import { CATEGORY_STYLES } from "@/lib/inventory-api";
import Badge from "../Badge";

export interface ProductsTableProps {
  products: Product[];
}

export default function ProductsTable({ products }: ProductsTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Current stock</th>
              <th className="px-4 py-3 font-medium">Min. stock</th>
              <th className="px-4 py-3 font-medium">Availability</th>
              <th className="px-4 py-3 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {products.map((product) => (
              <tr key={product.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-900">{product.name}</div>
                  <div className="text-xs text-zinc-500">{product.sku}</div>
                </td>
                <td className="px-4 py-3">
                  <Badge
                    label={product.category}
                    className={CATEGORY_STYLES[product.category] ?? CATEGORY_STYLES.Other}
                  />
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  {[product.city, product.country].filter(Boolean).join(", ")}
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  ${product.price_cop.toLocaleString()} COP
                  <span className="text-zinc-400"> / </span>${product.price_usd.toFixed(2)} USD
                </td>
                <td className="px-4 py-3">
                  <Badge
                    label={`${product.current_stock}`}
                    title={`${product.current_stock} units in stock at ${product.city ?? product.country}`}
                    className={
                      product.current_stock > 0
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
                    }
                    maxWidthClass="max-w-none"
                  />
                </td>
                <td className="px-4 py-3 text-zinc-700">{product.minimum_stock}</td>
                <td className="px-4 py-3">
                  <Badge
                    label={product.is_available ? "Available" : "Unavailable"}
                    className={
                      product.is_available
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-zinc-100 text-zinc-600"
                    }
                  />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/inventory/products/${product.id}/edit`}
                    className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {products.length === 0 && (
        <div className="px-4 py-12 text-center text-sm text-zinc-500">
          No products found.
        </div>
      )}
    </div>
  );
}
