import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

// Centralizes what used to be hand-rolled per page — a mix of
// `bg-brasa-red`, `bg-indigo-600`, and plain `border-zinc-300` buttons
// with no consistent hierarchy (see app/inventory/page.tsx's two
// differently-styled actions before this component existed). One primary
// action per screen should use `primary`; everything else `secondary` or
// `ghost`; destructive actions (delete, discard) use `danger`.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-brasa-red text-white hover:bg-brasa-red-dark focus-visible:ring-brasa-red disabled:bg-brasa-red/50",
  secondary:
    "border border-admin-border bg-white text-[#221810] hover:bg-surface-muted focus-visible:ring-brasa-red disabled:text-zinc-400",
  ghost:
    "text-[#221810]/80 hover:bg-surface-muted focus-visible:ring-brasa-red disabled:text-zinc-400",
  danger:
    "bg-brasa-error text-white hover:bg-brasa-error/90 focus-visible:ring-brasa-error disabled:bg-brasa-error/50",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

/** Same visual classes Button applies, exported for `next/link` "action
 * links" styled as buttons (e.g. "Log Incident", "Register delivery") —
 * a real `<a>` navigates, so it can't use the `<button>` element itself,
 * but it should look identical rather than re-deriving its own classes. */
export function buttonClassName(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className = "",
): string {
  return `inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`;
}

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  leftIcon,
  rightIcon,
  disabled,
  className = "",
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
        />
      ) : (
        leftIcon && (
          <span aria-hidden="true" className="shrink-0">
            {leftIcon}
          </span>
        )
      )}
      <span className="truncate">{children}</span>
      {!loading && rightIcon ? (
        <span aria-hidden="true" className="shrink-0">
          {rightIcon}
        </span>
      ) : null}
    </button>
  );
}
