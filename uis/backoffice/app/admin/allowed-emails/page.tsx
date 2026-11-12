"use client";

import { useCallback, useEffect, useState } from "react";
import PageSkeleton, { usePageLoading } from "@/components/PageSkeleton";
import PageHeader from "@/components/PageHeader";
import FormField from "@/components/FormField";
import ErrorState from "@/components/ErrorState";
import EmptyState from "@/components/EmptyState";
import RestrictedState from "@/components/RestrictedState";
import { useAdminGate } from "@/hooks/useAdminGate";
import { isRetryableError } from "@/lib/api-error";
import { addAllowedEmail, fetchAllowedEmails, removeAllowedEmail } from "@/lib/allowed-emails-api";
import type { AllowedEmailEntry } from "@/lib/allowed-emails";

const emailPattern = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/;

export default function AllowedEmailsPage() {
  const sessionLoading = usePageLoading();
  const adminStatus = useAdminGate();

  const [entries, setEntries] = useState<AllowedEmailEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [newEmail, setNewEmail] = useState("");
  const [addError, setAddError] = useState<string | undefined>(undefined);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchAllowedEmails();
      setEntries(result);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading || adminStatus !== "admin") return;
    load();
  }, [sessionLoading, adminStatus, load]);

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = newEmail.trim();
    if (!emailPattern.test(email)) {
      setAddError("Enter a valid email address.");
      return;
    }
    setAddError(undefined);
    setIsAdding(true);
    try {
      const entry = await addAllowedEmail(email);
      setEntries((current) => [entry, ...current]);
      setNewEmail("");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "We couldn't add that email.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    try {
      await removeAllowedEmail(id);
      setEntries((current) => current.filter((entry) => entry.id !== id));
    } catch {
      // Best-effort — list stays as-is; the user can retry the removal.
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Registration Access"
        description="Only emails on this list may create a backoffice account. Removing one only blocks future registration attempts — it never affects an account already created."
      />

      {sessionLoading || adminStatus === "checking" ? null : adminStatus !== "admin" ? (
        <RestrictedState message="Managing who can register is only available to admins." />
      ) : (
        <>
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
            <FormField
              id="new-allowed-email"
              label="Email to allow"
              type="email"
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value);
                if (addError) setAddError(undefined);
              }}
              error={addError}
              className="w-72"
              placeholder="new.hire@brasaland.com"
            />
            <button
              type="submit"
              disabled={isAdding}
              className="flex min-h-10 items-center justify-center rounded-md bg-brasa-red px-4 py-2 text-sm font-semibold text-white outline-none transition-colors hover:bg-brasa-red-dark focus-visible:ring-2 focus-visible:ring-brasa-red focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAdding ? "Adding..." : "Allow email"}
            </button>
          </form>

          {error ? (
            <ErrorState
              message={error instanceof Error ? error.message : "We couldn't load the allowed-emails list right now."}
              onRetry={isRetryableError(error) ? load : undefined}
            />
          ) : !isLoading && entries.length === 0 ? (
            <EmptyState
              title="No emails allowed yet"
              message="Add an email above to let that person create a backoffice account."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <th scope="col" className="px-4 py-3 font-medium">Email</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 font-medium">Added</th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-700">{entry.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            entry.registered ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {entry.registered ? "Registered" : "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemove(entry.id)}
                          disabled={removingId === entry.id}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-brasa-error outline-none hover:bg-error-bg focus-visible:ring-2 focus-visible:ring-brasa-error disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {removingId === entry.id ? "Removing..." : "Remove"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
