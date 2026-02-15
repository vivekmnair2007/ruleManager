import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet } from "../api/client";

export function RulesListPage() {
  const query = useQuery({
    queryKey: ["rules"],
    queryFn: () => apiGet<{ items: Array<{ ruleId: string; name: string }> }>("/v1/rulesets")
  });

  return (
    <section>
      <h2>Rules list</h2>
      <p>Placeholder list wired through React Query.</p>
      {query.data?.items?.map((item) => (
        <div key={item.ruleId}>
          <Link to={`/rules/${item.ruleId}`}>{item.name}</Link>
        </div>
      ))}
    </section>
  );
}
