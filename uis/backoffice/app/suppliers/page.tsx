"use client";

import PageSkeleton, { usePageLoading } from "@/components/PageSkeleton";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchSuppliers } from "@/lib/suppliers-api";
import PageHeader from "@/components/PageHeader";
import SupplierFilters from "@/components/SupplierFilters";
import SupplierListClient from "@/components/SupplierListClient";
import type { Supplier } from "@/lib/suppliers-types";

const emptySearchParams = new URLSearchParams();

export default function SuppliersPage() {
  return (
    <Suspense fallback={<PageSkeleton loading><SuppliersContent searchParams={emptySearchParams} /></PageSkeleton>}>
      <SuppliersWithSearchParams />
    </Suspense>
  );
}

function SuppliersWithSearchParams() {
  const searchParams = useSearchParams();
  return <SuppliersContent searchParams={searchParams} />;
}

function SuppliersContent({ searchParams }: { searchParams: Pick<URLSearchParams, "get" | "getAll" | "toString"> }) {
  const sessionLoading = usePageLoading();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionLoading) return;
    const loadSuppliers = async () => {
      setIsLoading(true);
      setError("");

      const category = searchParams.get("product_category") ?? undefined;
      const status = searchParams.get("status") ?? undefined;

      try {
        const data = await fetchSuppliers({
          product_category: category,
          status,
        });

        setSuppliers(data);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load suppliers.";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadSuppliers();
  }, [searchParams, sessionLoading]);

  return (
    <PageSkeleton loading={isLoading && !error}>
      <div className="space-y-6">
        <PageHeader
          title="Suppliers Directory"
          description="Manage restaurant supply chain partners."
          actions={
            <Link
              href="/suppliers/new"
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-1"
            >
              + New supplier
            </Link>
          }
        />

        <SupplierFilters searchParams={searchParams} />

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : suppliers.length === 0 && !isLoading ? (
          <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500">
            No suppliers found.
          </div>
        ) : (
          <SupplierListClient
            suppliers={suppliers}
            isLoading={isLoading}
            onSupplierUpdated={(updated) => setSuppliers((current) =>
              current.map((supplier) => supplier.id === updated.id ? updated : supplier),
            )}
          />
        )}
      </div>
    </PageSkeleton>
  );
}
