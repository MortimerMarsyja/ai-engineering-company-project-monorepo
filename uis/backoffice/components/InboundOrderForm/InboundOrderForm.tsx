"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createInboundOrder, fetchProducts } from "@/lib/inventory-api";
import { validateQuantity } from "@/lib/inventory-form";
import type { Product } from "@/lib/inventory-types";
import FormField from "../FormField";
import { useToast } from "../ToastProvider";

export default function InboundOrderForm() {
  const router = useRouter();
  const toast = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [supplierId, setSupplierId] = useState("");

  const [quantityError, setQuantityError] = useState<string | undefined>();
  const [productError, setProductError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    fetchProducts()
      .then((data) => {
        if (active) setProducts(data);
      })
      .catch((err) => {
        if (active) {
          setLoadError(
            err instanceof Error
              ? err.message
              : "We couldn't load the product list. Please try again.",
          );
        }
      })
      .finally(() => {
        if (active) setLoadingProducts(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedProduct = products.find((p) => String(p.id) === productId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const qtyError = validateQuantity(quantity);
    const prodError = selectedProduct ? undefined : "Select a product";
    setQuantityError(qtyError);
    setProductError(prodError);
    if (qtyError || prodError || !selectedProduct) return;

    setSubmitting(true);
    try {
      await createInboundOrder({
        ingredient_id: selectedProduct.id,
        quantity: Number(quantity),
        unit: unit.trim() || "kg",
        supplier_id: supplierId.trim() ? Number(supplierId) : null,
        country: selectedProduct.country,
        city: selectedProduct.city,
      });
      toast.success(`Delivery registered for ${selectedProduct.name}.`);
      router.push("/inventory");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "We couldn't register this delivery. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {loadError}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3 text-xs uppercase tracking-wide text-zinc-500">
        Register delivery
      </div>

      <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-zinc-700">
            Product<span className="text-rose-500"> *</span>
          </span>
          <select
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setProductError(undefined);
            }}
            disabled={loadingProducts}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">
              {loadingProducts ? "Loading products…" : "Select a product"}
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.city ?? p.country} ({p.sku}) · {p.current_stock} in stock
              </option>
            ))}
          </select>
          {productError ? (
            <span className="text-xs text-rose-600" role="alert">
              {productError}
            </span>
          ) : null}
        </label>

        <FormField
          label="Quantity"
          required
          type="number"
          min="0"
          step="any"
          value={quantity}
          onChange={(e) => {
            setQuantity(e.target.value);
            setQuantityError(undefined);
          }}
          placeholder="25"
          error={quantityError}
        />

        <FormField
          label="Unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="kg"
        />

        <FormField
          label="Supplier ID"
          type="number"
          min="1"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          placeholder="Optional"
          className="sm:col-span-2"
        />

        <div className="sm:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={submitting || loadingProducts}
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Registering…" : "Register delivery"}
          </button>
        </div>
      </form>
    </div>
  );
}
