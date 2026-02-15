import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";

export function RulesetDetailPage() {
  const id = useParams().rulesetId!;
  const detail = useQuery({ queryKey: ["ruleset", id], queryFn: () => apiGet(`/v1/rulesets/${id}`), enabled: Boolean(id) });

  return (
    <section>
      <h2>Ruleset detail</h2>
      <p>Versions timeline placeholder.</p>
      <pre>{JSON.stringify(detail.data, null, 2)}</pre>
    </section>
  );
}
