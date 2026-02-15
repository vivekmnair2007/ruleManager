import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { apiGet, apiWrite, HttpError } from "../api/client";

export function RuleDetailPage() {
  const params = useParams();
  const id = params.ruleId!;
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ["rule", id],
    queryFn: () => apiGet<any>(`/v1/rules/${id}`, `rule:${id}`),
    enabled: Boolean(id)
  });

  const patch = useMutation({
    mutationFn: () => apiWrite(`/v1/rules/${id}`, "PATCH", { description: "Updated" }, `rule:${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rule", id] })
  });

  return (
    <section>
      <h2>Rule detail</h2>
      <p>Metadata + versions timeline placeholder.</p>
      <button onClick={() => patch.mutate()}>Patch metadata</button>
      {patch.error instanceof HttpError && patch.error.status === 412 ? (
        <div style={{ background: "#fee", padding: "0.5rem", marginTop: "0.5rem" }}>
          Conflict detected. Resource changed. <button onClick={() => queryClient.invalidateQueries({ queryKey: ["rule", id] })}>Refresh</button>
        </div>
      ) : null}
      <pre>{JSON.stringify(detail.data, null, 2)}</pre>
    </section>
  );
}
