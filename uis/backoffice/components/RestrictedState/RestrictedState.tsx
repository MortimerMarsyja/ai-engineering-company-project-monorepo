import { Lock } from "lucide-react";

export interface RestrictedStateProps {
  title?: string;
  message?: string;
}

/** "This isn't for your role" — deliberately calmer than `ErrorState`
 * (no red alert styling, no "try again"): nothing went wrong, the report
 * just isn't part of this account's role. Pages render this instead of
 * ever calling a staff-gated endpoint, so a non-staff account never sees
 * a 403 — it never makes the request in the first place. */
export default function RestrictedState({
  title = "Not available for your role",
  message = "This report is only available to managers and admins. Contact an administrator if you need access.",
}: RestrictedStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-zinc-200 bg-white px-6 py-12 text-center shadow-sm">
      <span className="flex size-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
        <Lock aria-hidden="true" className="size-5" />
      </span>
      <p className="text-sm font-semibold text-zinc-700">{title}</p>
      <p className="max-w-md text-sm text-zinc-500">{message}</p>
    </div>
  );
}
