"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import PageSkeleton from "@/components/PageSkeleton";
import { useAuthGuard } from "@/hooks/useAuthGuard";

const publicRoutes = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
]);

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isPublicRoute = publicRoutes.has(pathname);
  const { status, error, retry } = useAuthGuard(pathname, isPublicRoute);

  if (isPublicRoute) {
    return <main className="min-h-screen">{children}</main>;
  }

  if (status === "unavailable") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-bold text-gray-950">Unable to verify session</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            {error ?? "The authentication service is unavailable. Try again before continuing."}
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-5 min-h-11 rounded-md bg-brasa-red px-4 py-2.5 text-sm font-semibold text-white outline-none transition-colors hover:bg-brasa-red-dark focus-visible:ring-2 focus-visible:ring-brasa-red focus-visible:ring-offset-2"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-[168px] min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <PageSkeleton loading={status === "checking"}>
          {children}
        </PageSkeleton>
      </main>
    </div>
  );
}
