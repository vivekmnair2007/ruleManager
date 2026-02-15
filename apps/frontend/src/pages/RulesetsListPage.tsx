import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet } from "../api/client";

export function RulesetsListPage() {
  const query = useQuery({ queryKey: ["rulesets"], queryFn: () => apiGet<{ items: Array<{ rulesetId: string; name: string }> }>("/v1/rulesets") });

  return (
    <section>
      <h2>Rulesets list</h2>
      {query.data?.items?.map((item) => (
        <div key={item.rulesetId}>
          <Link to={`/rulesets/${item.rulesetId}`}>{item.name}</Link>
        </div>
      ))}
    </section>
  );
}
