"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type ToastKind = "success" | "error" | "warning" | "info";

export interface ToastProps {
  kind: ToastKind;
  message: string;
  onDismiss?: () => void;
}

const KIND_STYLES: Record<ToastKind, { container: string; icon: string; ring: string }> = {
  success: {
    container: "border-success-border bg-success-bg text-success",
    icon: "text-success",
    ring: "focus-visible:ring-success",
  },
  error: {
    container: "border-error-border bg-error-bg text-brasa-error",
    icon: "text-brasa-error",
    ring: "focus-visible:ring-brasa-error",
  },
  warning: {
    container: "border-warning-border bg-warning-bg text-warning",
    icon: "text-warning",
    ring: "focus-visible:ring-warning",
  },
  info: {
    container: "border-info-border bg-info-bg text-info",
    icon: "text-info",
    ring: "focus-visible:ring-info",
  },
};

const KIND_ICON: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export default function Toast({ kind, message, onDismiss }: ToastProps) {
  const styles = KIND_STYLES[kind];
  const Icon = KIND_ICON[kind];

  return (
    <div
      role={kind === "error" || kind === "warning" ? "alert" : "status"}
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${styles.container}`}
    >
      <Icon aria-hidden="true" className={`size-5 shrink-0 ${styles.icon}`} />
      <span className="flex-1 break-words">{message}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className={`shrink-0 rounded p-0.5 opacity-60 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-1 ${styles.ring}`}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
