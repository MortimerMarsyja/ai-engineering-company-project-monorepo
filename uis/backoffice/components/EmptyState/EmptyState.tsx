export interface EmptyStateProps {
  title: string;
  message: string;
}

/** Explicit "nothing computed yet" state — distinct from `ErrorState`
 * (the call failed) and from a table rendered with zeroed-out rows (which
 * would misrepresent "no data" as "zero activity"). Used whenever the
 * absence of data is itself the real, correct outcome. */
export default function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-zinc-700">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">{message}</p>
    </div>
  );
}
