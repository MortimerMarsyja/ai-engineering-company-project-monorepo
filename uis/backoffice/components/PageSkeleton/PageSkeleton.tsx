"use client";

import { createContext, useContext, type ReactNode } from "react";
import styles from "./PageSkeleton.module.css";

const LoadingContext = createContext(false);

export function usePageLoading() {
  return useContext(LoadingContext);
}

/** Keep the page's actual layout mounted throughout session and data loading. */
export default function PageSkeleton({
  loading = false,
  children,
}: {
  loading?: boolean;
  children: ReactNode;
}) {
  const inheritedLoading = usePageLoading();
  const isLoading = inheritedLoading || loading;

  return (
    <LoadingContext.Provider value={isLoading}>
      <div aria-busy={isLoading}>
        {isLoading && !inheritedLoading ? (
          <span className="sr-only" role="status">Loading page</span>
        ) : null}
        <div
          className={isLoading ? styles.loading : undefined}
          inert={isLoading || undefined}
          aria-hidden={isLoading || undefined}
        >
          {children}
        </div>
      </div>
    </LoadingContext.Provider>
  );
}
