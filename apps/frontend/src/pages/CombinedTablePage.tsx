import { useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { apiGet, apiWrite, HttpError } from "../api/client";
import { RuleAstBuilder } from "../components/rules/RuleAstBuilder";
import { defaultAst } from "../components/rules/ruleAst";

type GroupRow = { rowType: "RULESET_GROUP"; rulesetVersionId: string; rulesetName: string; version: number; status: string; executionMode: "SEQUENTIAL" | "PARALLEL"; stats: { entriesActive: number; entriesTotal: number }; lastUpdatedAt: string; etag: string };
type EntryRow = { rowType: "RULE_ENTRY"; entryId: string; order: number | null; entryStatus: boolean; ruleName: string; ruleType: string; ruleVersionId: string; ruleVersionStatus: string; decisionSummary: string; tags: string[]; etag: string };

function EntryRowView({ row, children }: { row: EntryRow; children: JSX.Element }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: row.entryId });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>{children}<button {...attributes} {...listeners} style={{ marginLeft: 8 }}>↕</button></div>;
}

export function CombinedTablePage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("rulesetName:asc");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [focusedRow, setFocusedRow] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<Record<string, EntryRow[]>>({});
  const [previewEntry, setPreviewEntry] = useState<EntryRow | null>(null);

  const groups = useQuery({ queryKey: ["combined-table", q, sort], queryFn: () => apiGet<{ items: GroupRow[] }>(`/v1/ruleset-table?q=${encodeURIComponent(q)}&sort=${encodeURIComponent(sort)}&page[size]=100`) });

  const childResults = useQueries({
    queries: (groups.data?.items ?? []).map((g) => ({
      queryKey: ["combined-table-children", g.rulesetVersionId, sort],
      enabled: expanded[g.rulesetVersionId],
      queryFn: () => apiGet<{ items: EntryRow[] }>(`/v1/ruleset-table/${g.rulesetVersionId}/entries?sort=order:asc&page[size]=200`)
    }))
  });

  const childMap = Object.fromEntries((groups.data?.items ?? []).map((g, i) => [g.rulesetVersionId, pendingOrder[g.rulesetVersionId] ?? childResults[i]?.data?.items ?? []]));
  const rows = useMemo(() => (groups.data?.items ?? []).flatMap((g) => [g, ...(expanded[g.rulesetVersionId] ? (childMap[g.rulesetVersionId] ?? []) : [])]), [groups.data, expanded, childMap]);

  const bulkMutation = useMutation({
    mutationFn: (payload: { rulesetVersionId: string; operation: "ENABLE" | "DISABLE" | "REORDER"; entries: Array<{ entryId: string; etag?: string; newOrder?: number }> }) => apiWrite(`/v1/ruleset-versions/${payload.rulesetVersionId}/entries:bulk`, "POST", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["combined-table"] })
  });

  const toggleMutation = useMutation({ mutationFn: (input: { entryId: string; enabled: boolean; etag: string }) => apiWrite(`/v1/ruleset-entries/${input.entryId}`, "PATCH", { enabled: input.enabled }, `entry:${input.entryId}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["combined-table"] }) });

  const sensors = useSensors(useSensor(PointerSensor));
  const containerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => containerRef.current, estimateSize: () => 44, overscan: 10 });

  const onKeyDown = (event: React.KeyboardEvent, groupId: string) => {
    if (event.key === "ArrowRight") setExpanded((s) => ({ ...s, [groupId]: true }));
    if (event.key === "ArrowLeft") setExpanded((s) => ({ ...s, [groupId]: false }));
  };

  return (
    <section>
      <h2>Combined Ruleset–Rule Table</h2>
      <div style={{ display: "flex", gap: 8 }}>
        <input placeholder="Search groups" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="rulesetName:asc">Name ↑</option><option value="lastUpdatedAt:desc">Updated ↓</option></select>
      </div>

      {bulkMutation.error instanceof HttpError && bulkMutation.error.status === 412 ? <div style={{ background: "#fee", padding: 8 }}>Ruleset draft changed since you loaded it. <button onClick={() => qc.invalidateQueries({ queryKey: ["combined-table"] })}>Refresh</button> <button disabled>View diff</button> <button onClick={() => bulkMutation.reset()}>Retry</button></div> : null}

      <div role="treegrid" ref={containerRef} style={{ height: 560, overflow: "auto", border: "1px solid #ddd", marginTop: 8 }}>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index] as GroupRow | EntryRow;
            const isFocused = focusedRow === (row.rowType === "RULESET_GROUP" ? row.rulesetVersionId : row.entryId);
            return (
              <div key={(row.rowType === "RULESET_GROUP" ? row.rulesetVersionId : row.entryId)} style={{ position: "absolute", top: item.start, left: 0, right: 0, height: item.size, padding: 8, borderBottom: "1px solid #eee", background: isFocused ? "#dbeafe" : "#fff" }} onClick={() => setFocusedRow(row.rowType === "RULESET_GROUP" ? row.rulesetVersionId : row.entryId)}>
                {row.rowType === "RULESET_GROUP" ? (
                  <div tabIndex={0} onKeyDown={(e) => onKeyDown(e, row.rulesetVersionId)}>
                    <button onClick={() => setExpanded((s) => ({ ...s, [row.rulesetVersionId]: !s[row.rulesetVersionId] }))}>{expanded[row.rulesetVersionId] ? "▾" : "▸"}</button>
                    <strong>{row.rulesetName}</strong> v{row.version} <span>{row.status}</span> <span>{row.executionMode}</span> <span>{row.stats.entriesActive}/{row.stats.entriesTotal}</span>
                    {row.executionMode === "PARALLEL" ? <span style={{ marginLeft: 12 }}>Decision precedence editable in draft settings</span> : null}
                    {row.executionMode === "SEQUENTIAL" && pendingOrder[row.rulesetVersionId] ? <button onClick={() => bulkMutation.mutate({ rulesetVersionId: row.rulesetVersionId, operation: "REORDER", entries: pendingOrder[row.rulesetVersionId].map((e, i) => ({ entryId: e.entryId, etag: e.etag, newOrder: i + 1 })) })}>Save order</button> : null}
                  </div>
                ) : (
                  <div style={{ paddingLeft: 32, outline: selected[row.entryId] ? "2px solid #22c55e" : "none" }}>
                    <input type="checkbox" checked={!!selected[row.entryId]} onChange={(e) => setSelected((s) => ({ ...s, [row.entryId]: e.target.checked }))} />
                    #{row.order ?? "-"} <input type="checkbox" checked={row.entryStatus} onChange={(e) => toggleMutation.mutate({ entryId: row.entryId, enabled: e.target.checked, etag: row.etag })} /> {row.ruleName} ({row.ruleType})
                    <span>{row.ruleVersionStatus}</span> <span>{row.decisionSummary}</span>
                    <button onClick={() => apiWrite(`/v1/rule-versions/${row.ruleVersionId}:try`, "POST", { txn: { amount: 42 } }).then((r) => alert(JSON.stringify(r)))}>Try</button>
                    <button onClick={() => setPreviewEntry(row)}>Preview logic</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <button onClick={() => {
          const grouped = (groups.data?.items ?? []).map((g) => ({ g, entries: (childMap[g.rulesetVersionId] ?? []).filter((e) => selected[e.entryId]) })).filter((x) => x.entries.length > 0);
          grouped.forEach((x) => bulkMutation.mutate({ rulesetVersionId: x.g.rulesetVersionId, operation: "ENABLE", entries: x.entries.map((e) => ({ entryId: e.entryId, etag: e.etag })) }));
        }}>Bulk enable</button>
        <button onClick={() => {
          const grouped = (groups.data?.items ?? []).map((g) => ({ g, entries: (childMap[g.rulesetVersionId] ?? []).filter((e) => selected[e.entryId]) })).filter((x) => x.entries.length > 0);
          grouped.forEach((x) => bulkMutation.mutate({ rulesetVersionId: x.g.rulesetVersionId, operation: "DISABLE", entries: x.entries.map((e) => ({ entryId: e.entryId, etag: e.etag })) }));
        }}>Bulk disable</button>
      </div>

      {groups.data?.items.filter((g) => g.executionMode === "SEQUENTIAL" && expanded[g.rulesetVersionId]).map((g) => {
        const entries = childMap[g.rulesetVersionId] ?? [];
        if (!entries.length) return null;
        return (
          <div key={g.rulesetVersionId} style={{ marginTop: 12, border: "1px solid #ddd", padding: 8 }}>
            <strong>Reorder {g.rulesetName} (drag then Save order)</strong>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => {
                if (!event.over) return;
                const oldIndex = entries.findIndex((e) => e.entryId === event.active.id);
                const newIndex = entries.findIndex((e) => e.entryId === event.over?.id);
                if (oldIndex < 0 || newIndex < 0) return;
                setPendingOrder((s) => ({ ...s, [g.rulesetVersionId]: arrayMove(entries, oldIndex, newIndex).map((e, i) => ({ ...e, order: i + 1 })) }));
              }}
            >
              <SortableContext items={entries.map((e) => e.entryId)} strategy={verticalListSortingStrategy}>
                {entries.map((e) => (
                  <EntryRowView key={e.entryId} row={e}><div style={{ padding: 6, border: "1px solid #eee", marginTop: 4 }}>{e.order}. {e.ruleName}</div></EntryRowView>
                ))}
              </SortableContext>
            </DndContext>
          </div>
        );
      })}

      {previewEntry ? <div style={{ position: "fixed", right: 0, top: 0, width: 420, height: "100%", background: "#fff", borderLeft: "1px solid #ddd", padding: 12 }}><h3>Preview logic</h3><RuleAstBuilder value={defaultAst()} onChange={() => {}} readOnly /><button onClick={() => setPreviewEntry(null)}>Close</button></div> : null}
    </section>
  );
}
