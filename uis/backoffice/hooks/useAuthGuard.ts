"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  authenticatedFetch,
  AuthenticationRequiredError,
} from "@/lib/authenticated-fetch";

type AuthStatus = "checking" | "authenticated" | "unavailable";

interface AuthState {
  pathname: string;
  status: AuthStatus;
  error?: string;
}

export function useAuthGuard(pathname: string, isPublicRoute: boolean) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AuthState>({
    pathname,
    status: isPublicRoute ? "authenticated" : "checking",
  });

  useEffect(() => {
    if (isPublicRoute) {
      setState({ pathname, status: "authenticated" });
      return;
    }

    const controller = new AbortController();
    setState({ pathname, status: "checking" });

    authenticatedFetch("/api/proxy/auth/me", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        if (response.ok) {
          setState({ pathname, status: "authenticated" });
          return;
        }

        if (response.status === 403) {
          router.replace("/login");
          return;
        }

        setState({
          pathname,
          status: "unavailable",
          error: `Session verification failed (HTTP ${response.status}). Try again.`,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof AuthenticationRequiredError) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          pathname,
          status: "unavailable",
          error: "Unable to connect to the authentication service. Check your connection and try again.",
        });
      });

    return () => controller.abort();
  }, [attempt, isPublicRoute, pathname, router]);

  const status =
    state.pathname === pathname ? state.status : ("checking" as const);

  useEffect(() => {
    if (status !== "unavailable") return;
    const retry = () => setAttempt((currentAttempt) => currentAttempt + 1);
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, [status]);

  return {
    status,
    error: state.pathname === pathname ? state.error : undefined,
    retry: () => setAttempt((currentAttempt) => currentAttempt + 1),
  };
}
