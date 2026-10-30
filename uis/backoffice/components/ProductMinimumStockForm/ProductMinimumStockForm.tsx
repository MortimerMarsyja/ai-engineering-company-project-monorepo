"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProductMinimumStock } from "@/lib/inventory-api";
import { validateUnitCost as validatePositiveNumber } from "@/lib/inventory-form";
import type { Product } from "@/lib/inventory-types";
import FormField from "../FormField";
import { useToast } from "../ToastProvider";

export interface ProductMinimumStockFormProps {
  product: Product;
}

/** The only editable field on a product today — see the Phase 3 gap report
 * for stock_threshold_triggered: this is the minimal "ajustar el umbral
 * mínimo" capability that event's own decision requires. */
export default function ProductMinimumStockForm({ product }: ProductMinimumStockFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [minimumStock, setMinimumStock] = useState(String(product.minimum_stock));
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationError = validatePositiveNumber(minimumStock);
    setError(validationError);
    if (validationError) return;

    setSubmitting(true);
    try {
      await updateProductMinimumStock(product.id, Number(minimumStock));
      toast.success(`Minimum stock updated for ${product.name}.`);
      router.push("/inventory");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "We couldn't update this product. Please try again.",
      );
      // Not tracked as form_submission_failed: the approved form_name enum
      // (docs/event-schemas.json) has no "product"/"inventory_product"
      // value, and none of its existing values describe this form
      // accurately — picking one anyway would misclassify the data rather
      // than just leaving it uncaptured. Flagged as a gap, not silently
      // worked around.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3 text-xs uppercase tracking-wide text-zinc-500">
        {product.name} — {product.sku}
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4 p-4">
        <FormField
          label="Minimum stock"
          required
          type="number"
          min="0"
          step="any"
          value={minimumStock}
          onChange={(e) => {
            setMinimumStock(e.target.value);
            setError(undefined);
          }}
          error={error}
        />
        <p className="text-xs text-zinc-500">
          Current stock: {product.current_stock}. An outbound order that brings stock below this
          number fires a low-stock alert.
        </p>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
