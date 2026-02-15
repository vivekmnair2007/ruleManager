import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet, UserRole } from "./api/client";
import { Layout } from "./components/Layout";
import { PermissionGate } from "./components/PermissionGate";
import { AuditLogPage } from "./pages/AuditLogPage";
import { CombinedTablePage } from "./pages/CombinedTablePage";
import { RuleDetailPage } from "./pages/RuleDetailPage";
import { RulesetsListPage } from "./pages/RulesetsListPage";
import { RulesetDetailPage } from "./pages/RulesetDetailPage";
import { RulesListPage } from "./pages/RulesListPage";

function Shell() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => apiGet<{ user?: { role?: UserRole } }>("/me") });
  const role = me.data?.user?.role ?? "Viewer";
  return <Layout role={role}><Outlet /></Layout>;
}

function AnalystOnly() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => apiGet<{ user?: { role?: UserRole } }>("/me") });
  const role = me.data?.user?.role ?? "Viewer";
  return <PermissionGate role={role} minimum="Analyst" fallback={<div>Insufficient permissions.</div>}><Outlet /></PermissionGate>;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/rules" replace /> },
      { path: "rules", element: <RulesListPage /> },
      { path: "rules/:ruleId", element: <RuleDetailPage /> },
      { path: "rulesets", element: <RulesetsListPage /> },
      { path: "rulesets/:rulesetId", element: <RulesetDetailPage /> },
      { path: "combined-table", element: <CombinedTablePage /> },
      {
        element: <AnalystOnly />,
        children: [{ path: "audit", element: <AuditLogPage /> }]
      }
    ]
  }
]);

export function App(): JSX.Element {
  return <RouterProvider router={router} />;
}
