"use client";

import { useCallback, useEffect, useState } from "react";
import PageSkeleton, { usePageLoading } from "@/components/PageSkeleton";
import PageHeader from "@/components/PageHeader";
import ErrorState from "@/components/ErrorState";
import BackLink from "@/components/BackLink";
import OrdersTable from "@/components/OrdersTable";
import { fetchOrders } from "@/lib/inventory-api";
import { isRetryableError } from "@/lib/api-error";
import type { Order } from "@/lib/inventory-types";

export default function InventoryOrdersPage() {
  const sessionLoading = usePageLoading();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchOrders();
      setOrders(data ?? []);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    loadOrders();
  }, [sessionLoading, loadOrders]);

  return (
    <PageSkeleton loading={isLoading && !error}>
      <div className="space-y-6">
        <BackLink href="/inventory">Back to inventory</BackLink>

        <PageHeader
          title="Order history"
          description="Every delivery and withdrawal logged across all locations."
        />

        {error ? (
          <ErrorState
            message={error instanceof Error ? error.message : "We couldn't load the order history right now. Please try again."}
            onRetry={isRetryableError(error) ? loadOrders : undefined}
          />
        ) : orders.length === 0 && !isLoading ? (
          <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500">
            No orders found.
          </div>
        ) : (
          <OrdersTable orders={orders} />
        )}
      </div>
    </PageSkeleton>
  );
}
