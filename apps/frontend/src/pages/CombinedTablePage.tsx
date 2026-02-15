import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";

export function CombinedTablePage() {
  const query = useQuery({ queryKey: ["combined-table"], queryFn: () => apiGet("/v1/ruleset-table?page[size]=10") });
  return (
    <section>
      <h2>Combined Ruleset–Rule Table</h2>
      <p>Placeholder view with lazy child loading to be added in next iteration.</p>
      <pre>{JSON.stringify(query.data, null, 2)}</pre>
    </section>
  );
}
