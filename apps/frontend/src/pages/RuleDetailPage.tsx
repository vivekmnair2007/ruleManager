import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { apiGet, apiWrite, HttpError } from "../api/client";
import { RuleAstBuilder } from "../components/rules/RuleAstBuilder";
import { defaultAst, generateRulePreview, RuleAstNode } from "../components/rules/ruleAst";

type RuleDetail = {
  ruleId: string;
  name: string;
  description: string;
  tags: string[];
  versions: Array<{ ruleVersionId: string; versionNumber: number; status: "DRAFT" | "APPROVED"; logicAst: RuleAstNode; decision: { action: string; reason_code?: string; metadata?: Record<string, unknown> }; description?: string }>;
};

export function RuleDetailPage() {
  const { ruleId = "" } = useParams();
  const queryClient = useQueryClient();
  const [txnPayload, setTxnPayload] = useState('{"txn":{"amount":120,"country":"US"}}');
  const [tryOpen, setTryOpen] = useState(false);

  const detail = useQuery({ queryKey: ["rule", ruleId], queryFn: () => apiGet<RuleDetail>(`/v1/rules/${ruleId}`, `rule:${ruleId}`) });
  const selectedDraft = useMemo(() => detail.data?.versions.find((v) => v.status === "DRAFT") ?? detail.data?.versions[0], [detail.data]);

  const [localMeta, setLocalMeta] = useState({ name: "", description: "", tags: "" });
  const [localAst, setLocalAst] = useState<RuleAstNode>(defaultAst());
  const [decision, setDecision] = useState({ action: "REVIEW", reason_code: "", metadata: "{}" });

  const syncLoaded = detail.data && localMeta.name === "";
  if (syncLoaded) {
    setLocalMeta({ name: detail.data.name, description: detail.data.description, tags: detail.data.tags.join(",") });
    if (selectedDraft) {
      setLocalAst(selectedDraft.logicAst);
      setDecision({ action: selectedDraft.decision.action, reason_code: selectedDraft.decision.reason_code ?? "", metadata: JSON.stringify(selectedDraft.decision.metadata ?? {}, null, 2) });
    }
  }

  const saveMetadata = useMutation({
    mutationFn: () => apiWrite(`/v1/rules/${ruleId}`, "PATCH", { ...localMeta, tags: localMeta.tags.split(",").map((t) => t.trim()).filter(Boolean) }, `rule:${ruleId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rule", ruleId] })
  });

  const saveVersion = useMutation({
    mutationFn: () => selectedDraft ? apiWrite(`/v1/rule-versions/${selectedDraft.ruleVersionId}`, "PATCH", {
      logicAst: localAst,
      decision: { action: decision.action, reason_code: decision.reason_code, metadata: JSON.parse(decision.metadata || "{}") }
    }, `rule-version:${selectedDraft.ruleVersionId}`) : Promise.resolve(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rule", ruleId] })
  });

  const tryMutation = useMutation({
    mutationFn: () => selectedDraft ? apiWrite(`/v1/rule-versions/${selectedDraft.ruleVersionId}:try`, "POST", JSON.parse(txnPayload)) : Promise.resolve(null)
  });

  return (
    <section>
      <h2>Rule detail</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
        <div>
          <h3>Metadata</h3>
          <input value={localMeta.name} onChange={(e) => setLocalMeta((s) => ({ ...s, name: e.target.value }))} placeholder="Name" />
          <textarea value={localMeta.description} onChange={(e) => setLocalMeta((s) => ({ ...s, description: e.target.value }))} placeholder="Description" />
          <input value={localMeta.tags} onChange={(e) => setLocalMeta((s) => ({ ...s, tags: e.target.value }))} placeholder="tag1,tag2" />
          <button onClick={() => saveMetadata.mutate()}>Save metadata</button>

          <h3>Version editor</h3>
          {selectedDraft?.status === "DRAFT" ? (
            <>
              <RuleAstBuilder value={localAst} onChange={setLocalAst} />
              <h4>Decision editor</h4>
              <select value={decision.action} onChange={(e) => setDecision((d) => ({ ...d, action: e.target.value }))}>
                {[
                  "ALLOW", "BLOCK", "REVIEW", "CHALLENGE", "TAG"
                ].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <input value={decision.reason_code} onChange={(e) => setDecision((d) => ({ ...d, reason_code: e.target.value }))} placeholder="reason_code" />
              <textarea value={decision.metadata} onChange={(e) => setDecision((d) => ({ ...d, metadata: e.target.value }))} />
              <p><strong>Live preview:</strong> {generateRulePreview(localAst, decision.action)}</p>
              <button onClick={() => saveVersion.mutate()}>Save draft version</button>
            </>
          ) : <p>Version is not DRAFT; editor is disabled.</p>}

          <button onClick={() => setTryOpen((v) => !v)}>Try it</button>
          {tryOpen ? (
            <div style={{ border: "1px solid #ccc", padding: 12, marginTop: 8 }}>
              <h4>Try it</h4>
              <textarea rows={10} value={txnPayload} onChange={(e) => setTxnPayload(e.target.value)} style={{ width: "100%" }} />
              <button onClick={() => tryMutation.mutate()}>Run</button>
              {tryMutation.data ? <pre>{JSON.stringify(tryMutation.data, null, 2)}</pre> : null}
            </div>
          ) : null}

          {saveVersion.error instanceof HttpError && saveVersion.error.status === 412 ? (
            <div style={{ background: "#fee", padding: 8 }}>
              Ruleset draft changed since you loaded it.
              <button onClick={() => queryClient.invalidateQueries({ queryKey: ["rule", ruleId] })}>Refresh</button>
              <button disabled>View diff</button>
              <button onClick={() => saveVersion.mutate()}>Retry</button>
            </div>
          ) : null}
        </div>
        <aside>
          <h3>Versions timeline</h3>
          {detail.data?.versions.map((v) => (
            <div key={v.ruleVersionId} style={{ border: "1px solid #ddd", marginBottom: 8, padding: 8 }}>
              v{v.versionNumber} <span style={{ background: v.status === "DRAFT" ? "#fde68a" : "#bbf7d0", padding: "2px 6px" }}>{v.status}</span>
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
}
