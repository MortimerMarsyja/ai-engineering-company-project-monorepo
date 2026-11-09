import type { InputHTMLAttributes, ReactNode } from "react";

export interface FormFieldProps
  extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  /** Rendered inside the field, right-aligned (e.g. a show/hide password
   * toggle) — the input gets right padding automatically when present. */
  trailingAction?: ReactNode;
}

export default function FormField({
  label,
  required,
  error,
  className = "",
  trailingAction,
  ...inputProps
}: FormFieldProps) {
  const hasError = Boolean(error);
  const fieldClass = `w-full rounded-lg border bg-white px-3 py-2 text-sm text-[#221810] focus:outline-none focus:ring-2 ${
    trailingAction ? "pr-10" : ""
  } ${
    hasError
      ? "border-brasa-error focus:border-brasa-error focus:ring-error-border"
      : "border-admin-border focus:border-brasa-red focus:ring-brasa-red/20"
  }`;

  return (
    <label className={`flex flex-col gap-1.5 text-sm ${className}`}>
      <span className="font-medium text-[#221810]/80">
        {label}
        {required ? <span className="text-brasa-error"> *</span> : null}
      </span>
      <span className="relative flex items-center">
        <input
          {...inputProps}
          aria-invalid={hasError || undefined}
          aria-describedby={
            error && inputProps.id
              ? `${inputProps.id}-error`
              : inputProps["aria-describedby"]
          }
          className={fieldClass}
        />
        {trailingAction ? (
          <span className="absolute right-1.5 flex items-center">{trailingAction}</span>
        ) : null}
      </span>
      {error ? (
        <span
          id={inputProps.id ? `${inputProps.id}-error` : undefined}
          className="text-xs text-brasa-error"
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </label>
  );
}
