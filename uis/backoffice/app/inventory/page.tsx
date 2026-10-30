"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import PageSkeleton, { usePageLoading } from "@/components/PageSkeleton";
import PageHeader from "@/components/PageHeader";
import ErrorState from "@/components/ErrorState";
import ProductsTable from "@/components/ProductsTable";
import { fetchProducts } from "@/lib/inventory-api";
import { isRetryableError } from "@/lib/api-error";
import type { Product } from "@/lib/inventory-types";
import { track } from "@/lib/telemetry";

export default function InventoryPage() {
  const sessionLoading = usePageLoading();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const startedAt = performance.now();
    try {
      const data = await fetchProducts();
      setProducts(data ?? []);
      // inventory_products_viewed (docs/event-schemas.json). cache_hit is
      // always false: GET /inventory/products isn't cached today (see
      // docs/cache-evaluation.md) — not invented.
      track("inventory_products_viewed", {
        product_count: (data ?? []).length,
        response_time_ms: performance.now() - startedAt,
        cache_hit: false,
      });
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    loadProducts();
  }, [sessionLoading, loadProducts]);

  return (
    <PageSkeleton loading={isLoading && !error}>
      <div className="space-y-6">
        <PageHeader
          title="Inventory"
          description="Stock on hand across every Brasaland location."
          actions={
            <div className="flex gap-2">
              <Link
                href="/inventory/exits/new"
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Log exit
              </Link>
              <Link
                href="/inventory/deliveries/new"
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                + Register delivery
              </Link>
            </div>
          }
        />

        <div className="flex items-center gap-2 text-sm">
          <Link href="/inventory/orders" className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline">
            View full order history →
          </Link>
        </div>

        {error ? (
          <ErrorState
            message={error instanceof Error ? error.message : "We couldn't load the inventory right now. Please try again."}
            onRetry={isRetryableError(error) ? loadProducts : undefined}
          />
        ) : products.length === 0 && !isLoading ? (
          <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500">
            No products found.
          </div>
        ) : (
          <ProductsTable products={products} />
        )}
      </div>
    </PageSkeleton>
  );
}
