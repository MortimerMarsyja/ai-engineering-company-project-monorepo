"use client";

import { useEffect, useState } from "react";
import { getCurrentAccount, isStaffRole } from "@/lib/profile";

type StaffGateStatus = "checking" | "staff" | "not-staff" | "unavailable";

/** Whether the current account may see staff-only report pages
 * (docs/PIPELINE_DESIGN.md / services/api's require_staff: admin or
 * manager). Pages use this to decide whether to even call a staff-gated
 * endpoint — never calling it (and never rendering its content) when the
 * answer is "not-staff", instead of letting the request 403 and showing
 * an error. `"unavailable"` (couldn't determine the role at all) is
 * treated the same as `"not-staff"` by callers: a page that can't verify
 * someone is staff must not show staff-only content, even on failure. */
export function useStaffGate(): StaffGateStatus {
  const [status, setStatus] = useState<StaffGateStatus>("checking");

  useEffect(() => {
    let isActive = true;

    getCurrentAccount()
      .then((account) => {
        if (!isActive) return;
        setStatus(isStaffRole(account.role) ? "staff" : "not-staff");
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
