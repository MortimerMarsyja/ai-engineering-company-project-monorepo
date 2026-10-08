"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FormField from "./FormField";
import Select from "./Select";
import { useToast } from "./ToastProvider";
import { createIncident } from "@/lib/incidents-api";
import {
  CATEGORY_OPTIONS,
  ORIGIN_OPTIONS,
  type IncidentCategory,
  type IncidentOrigin,
} from "@/lib/incidents";

interface FormState {
  title: string;
  description: string;
  category: IncidentCategory;
  origin: IncidentOrigin;
  branch: string;
  customer_id: string;
  reporter_id: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  category: "EQUIPMENT",
  origin: "branch",
  branch: "",
  customer_id: "",
  reporter_id: "",
};

type FormErrors = Partial<Record<keyof FormState, string>>;

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!form.title.trim()) errors.title = "Title is required.";
  if (form.description.trim().length < 5) {
    errors.description = "Description must be at least 5 characters.";
  }
  if (!form.branch.trim()) errors.branch = "Branch is required.";
  return errors;
}

export default function IncidentForm() {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const incident = await createIncident({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        origin: form.origin,
        branch: form.branch.trim(),
        customer_id: form.customer_id.trim() || undefined,
        reporter_id: form.reporter_id.trim() || undefined,
      });
      toast.success("Incident logged successfully.");
      if (incident?.id) {
        router.push(`/incidents/${incident.id}`);
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't log this incident. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <FormField
          id="title"
          label="Title"
          required
          value={form.title}
          onChange={(e) => update("title", e.target.value)}
          error={errors.title}
          placeholder="e.g. Walk-in cooler not cooling"
        />

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-zinc-700">
            Description<span className="text-rose-500"> *</span>
          </span>
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            rows={4}
            placeholder="What happened, when, and any context that will help whoever picks this up"
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 ${
              errors.description
                ? "border-rose-300 focus:border-rose-500 focus:ring-rose-200"
                : "border-zinc-300 focus:border-indigo-500 focus:ring-indigo-200"
            }`}
          />
          {errors.description ? (
            <span className="text-xs text-rose-600">{errors.description}</span>
          ) : null}
        </label>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Select
            label="Category"
            options={CATEGORY_OPTIONS}
            value={form.category}
            onChange={(value) => update("category", value)}
          />
          <Select
            label="Who's reporting this"
            options={ORIGIN_OPTIONS}
            value={form.origin}
            onChange={(value) => update("origin", value)}
          />
        </div>

        <FormField
          id="branch"
          label="Branch"
          required
          value={form.branch}
          onChange={(e) => update("branch", e.target.value)}
          error={errors.branch}
          placeholder="e.g. COL-01, FLA-02, or HQ"
        />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField
            id="customer_id"
            label="Customer ID (optional)"
            value={form.customer_id}
            onChange={(e) => update("customer_id", e.target.value)}
            placeholder="CLI-000000"
          />
          <FormField
            id="reporter_id"
            label="Reporter ID (optional)"
            value={form.reporter_id}
            onChange={(e) => update("reporter_id", e.target.value)}
            placeholder="MGR-00"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-brasa-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brasa-red/90 disabled:opacity-60"
          >
            {isSubmitting ? "Logging…" : "Log Incident"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/incidents")}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            Cancel
          </button>
        </div>
      </form>
  );
}
