import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";

export function AuditLogPage() {
  const query = useQuery({ queryKey: ["audit-events"], queryFn: () => apiGet("/v1/audit-events") });

  return (
    <section>
      <h2>Audit log viewer</h2>
      <p>Read-only table placeholder with filters in API.</p>
      <pre>{JSON.stringify(query.data, null, 2)}</pre>
    </section>
  );
}
