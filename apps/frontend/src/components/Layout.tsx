import { Link } from "react-router-dom";
import type { PropsWithChildren } from "react";
import type { UserRole } from "../api/client";

export function Layout({ role, children }: PropsWithChildren<{ role: UserRole }>) {
  return (
    <main style={{ fontFamily: "sans-serif", margin: "1.25rem" }}>
      <h1>Rule Management Portal</h1>
      <p>Role: <strong>{role}</strong></p>
      <nav style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <Link to="/rules">Rules</Link>
        <Link to="/rulesets">Rulesets</Link>
        <Link to="/combined-table">Combined Table</Link>
        <Link to="/audit">Audit Log</Link>
      </nav>
      {children}
    </main>
  );
}
