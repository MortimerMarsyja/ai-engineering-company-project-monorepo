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
      className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
    >
      <p>{message}</p>
      {(onRetry || backHref) && (
        <div className="mt-3 flex items-center gap-4">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
            >
              Try again
            </button>
          ) : null}
          {backHref ? (
            <Link href={backHref} className="text-xs font-medium text-rose-700 underline hover:text-rose-900">
              {backLabel}
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
