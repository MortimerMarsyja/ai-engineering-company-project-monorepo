"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import BackLink from "@/components/BackLink";
import ErrorState from "@/components/ErrorState";
import PageHeader from "@/components/PageHeader";
import PageSkeleton, { usePageLoading } from "@/components/PageSkeleton";
import ProductMinimumStockForm from "@/components/ProductMinimumStockForm";
import { isRetryableError } from "@/lib/api-error";
import { fetchProduct } from "@/lib/inventory-api";
import type { Product } from "@/lib/inventory-types";

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const sessionLoading = usePageLoading();

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchProduct(Number(id));
      setProduct(result);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (sessionLoading) return;
    load();
  }, [sessionLoading, load]);

  if (sessionLoading || isLoading) {
    return (
      <PageSkeleton loading>
        <div className="space-y-6">
          <PageHeader title="Edit product" description="Adjust the minimum-stock threshold." />
          <div className="h-40 rounded-xl border border-zinc-200 bg-white" />
        </div>
      </PageSkeleton>
    );
  }

  if (error || !product) {
    return (
      <div className="space-y-4">
        <BackLink href="/inventory">Back to inventory</BackLink>
        <ErrorState
          message={error instanceof Error ? error.message : "We couldn't find this product."}
          onRetry={isRetryableError(error) ? load : undefined}
          backHref="/inventory"
          backLabel="Back to inventory"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink href="/inventory">Back to inventory</BackLink>
      <PageHeader title="Edit product" description="Adjust the minimum-stock threshold." />
      <ProductMinimumStockForm product={product} />
    </div>
  );
}
