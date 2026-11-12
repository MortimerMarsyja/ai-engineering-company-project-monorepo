"use client";

import { useEffect, useState } from "react";
import { getCurrentAccount, isAdminRole } from "@/lib/profile";

type AdminGateStatus = "checking" | "admin" | "not-admin" | "unavailable";

/** Whether the current account may see admin-only features (e.g. the
 * registration whitelist panel — services/api's require_admin). Same
 * shape/contract as useStaffGate: pages check this before ever calling an
 * admin-gated endpoint, and "unavailable" is treated the same as
 * "not-admin" — never show admin-only content when the role can't be
 * verified. */
export function useAdminGate(): AdminGateStatus {
  const [status, setStatus] = useState<AdminGateStatus>("checking");

  useEffect(() => {
    let isActive = true;

    getCurrentAccount()
      .then((account) => {
        if (!isActive) return;
        setStatus(isAdminRole(account.role) ? "admin" : "not-admin");
      })
      .catch(() => {
        if (!isActive) return;
        setStatus("unavailable");
      });

    return () => {
      isActive = false;
    };
  }, []);

  return status;
}
