import type { PropsWithChildren, ReactNode } from "react";
import { UserRole } from "../api/client";

const order: UserRole[] = ["Viewer", "Analyst", "Approver", "Admin"];

function allowed(current: UserRole, minimum: UserRole) {
  return order.indexOf(current) >= order.indexOf(minimum);
}

export function PermissionGate({ role, minimum, fallback, children }: PropsWithChildren<{ role: UserRole; minimum: UserRole; fallback?: ReactNode }>) {
  if (!allowed(role, minimum)) {
    return <>{fallback ?? null}</>;
  }
  return <>{children}</>;
}
