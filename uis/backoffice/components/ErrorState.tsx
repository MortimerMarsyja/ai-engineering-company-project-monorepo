import { AlertCircle } from "lucide-react";
import Link from "next/link";

export interface ErrorStateProps {
  /** User-friendly message — never pass a raw status code or stack trace here. */
  message: string;
  onRetry?: () => void;
  backHref?: string;
  backLabel?: string;
}

/** Standard "rejected" state for async data: message + a way forward. */
export default function ErrorState({ message, onRetry, backHref, backLabel = "Go back" }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-error-border bg-error-bg px-4 py-3 text-sm text-brasa-error"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div>
        <p>{message}</p>
        {(onRetry || backHref) && (
          <div className="mt-3 flex items-center gap-4">
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md border border-error-border bg-white px-3 py-1.5 text-xs font-semibold text-brasa-error outline-none hover:bg-error-bg focus-visible:ring-2 focus-visible:ring-brasa-error focus-visible:ring-offset-2"
              >
                Try again
              </button>
            ) : null}
            {backHref ? (
              <Link
                href={backHref}
                className="rounded-sm text-xs font-medium text-brasa-error underline outline-none hover:text-brasa-error/80 focus-visible:ring-2 focus-visible:ring-brasa-error"
              >
                {backLabel}
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
