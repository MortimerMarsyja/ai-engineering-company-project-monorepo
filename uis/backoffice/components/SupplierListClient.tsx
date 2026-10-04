"use client";

import type { Supplier } from "@/lib/suppliers-types";
import SuppliersTable from "./SuppliersTable";

export default function SupplierListClient({
  suppliers = [],
  isLoading = false,
  onSupplierUpdated,
}: {
  suppliers?: Supplier[];
  isLoading?: boolean;
  onSupplierUpdated: (supplier: Supplier) => void;
}) {
  const rows: Supplier[] = isLoading
    ? Array.from({ length: 6 }, (_, index) => ({
        id: -index - 1, full_name: "\u00a0".repeat(20), email: "\u00a0".repeat(28), phone: "",
        country: "Colombia", city: "\u00a0".repeat(12), favorite_location: null,
        dietary_preferences: [], how_did_you_find_us: "", date_of_birth: "",
        accepts_terms: false, wants_email_offers: false, product_category: "Other",
        rate: 0, status: "active", created_at: "", updated_at: "",
      }))
    : suppliers;

  const activeCount = suppliers.filter((s) => s.status === "active").length;
  const suspendedCount = suppliers.filter(
    (s) => s.status === "suspended",
  ).length;

  return (
    <>
      {/* Stats summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Suppliers" value={suppliers.length} />
        <StatCard
          label="Active"
          value={activeCount}
          accent="text-emerald-600"
        />
        <StatCard
          label="Suspended"
          value={suspendedCount}
          accent="text-rose-600"
        />
      </div>

      {/* Table */}
      <SuppliersTable
        suppliers={rows}
        onSupplierUpdated={onSupplierUpdated}
      />
    </>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${accent ?? "text-zinc-900"}`}>
        {value}
      </p>
    </div>
  );
}
