import { FIELD_CATALOG, OPERATOR_LABEL, OPERATORS_BY_TYPE, RuleAstNode, RuleOperator, defaultCondition } from "./ruleAst";

interface BuilderProps {
  value: RuleAstNode;
  onChange: (node: RuleAstNode) => void;
  readOnly?: boolean;
}

interface NodeProps extends BuilderProps {
  node: RuleAstNode;
}

const unaryOps = new Set<RuleOperator>(["IS_NULL", "IS_NOT_NULL", "IS_EMPTY"]);

function parseValue(raw: string, fieldType: string): string | number | boolean {
  if (fieldType === "NUMBER") return Number(raw);
  if (fieldType === "BOOLEAN") return raw === "true";
  return raw;
}

function PredicateEditor({ node, onChange, readOnly }: { node: Extract<RuleAstNode, { nodeType: "CONDITION" }>; onChange: (next: Extract<RuleAstNode, { nodeType: "CONDITION" }>) => void; readOnly?: boolean }) {
  const field = FIELD_CATALOG.find((f) => f.fieldKey === node.fieldKey) ?? FIELD_CATALOG[0];
  const allowed = OPERATORS_BY_TYPE[field.type];
  return <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr", gap: 8 }}>
    <select disabled={readOnly} value={node.fieldKey} onChange={(e) => {
      const nextField = FIELD_CATALOG.find((f) => f.fieldKey === e.target.value) ?? FIELD_CATALOG[0];
      onChange({ ...node, fieldKey: nextField.fieldKey, operator: OPERATORS_BY_TYPE[nextField.type][0] });
    }}>{FIELD_CATALOG.map((f) => <option key={f.fieldKey} value={f.fieldKey}>{f.label}</option>)}</select>
    <select disabled={readOnly} value={node.operator} onChange={(e) => onChange({ ...node, operator: e.target.value as RuleOperator })}>{allowed.map((op) => <option key={op} value={op}>{OPERATOR_LABEL[op]}</option>)}</select>
    {unaryOps.has(node.operator)
      ? <div style={{ fontStyle: "italic" }}>No value</div>
      : <input disabled={readOnly} value={Array.isArray(node.value) ? node.value.join(",") : String(node.value ?? "")} onChange={(e) => {
        const txt = e.target.value;
        const list = ["IN", "NOT_IN", "MEMBER_OF", "NOT_MEMBER_OF", "BETWEEN", "NOT_BETWEEN"].includes(node.operator);
        onChange({ ...node, value: list ? txt.split(",").map((x) => parseValue(x.trim(), field.type)) : parseValue(txt, field.type) });
      }} />}
  </div>;
}

function NodeEditor({ node, onChange, readOnly }: NodeProps) {
  if (node.nodeType === "CONDITION") return <PredicateEditor node={node} onChange={(n) => onChange(n)} readOnly={readOnly} />;
  if (node.nodeType === "NOT") return <div style={{ borderLeft: "3px solid #f59e0b", paddingLeft: 12 }}><div>NOT</div><NodeEditor node={node.child} value={node.child} onChange={(child) => onChange({ nodeType: "NOT", child })} readOnly={readOnly} /></div>;
  return <div style={{ borderLeft: "3px solid #3b82f6", paddingLeft: 12 }}>
    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
      <strong>{node.nodeType} group</strong>
      <button disabled={readOnly} onClick={() => onChange({ ...node, children: [...node.children, defaultCondition()] })}>+ Predicate</button>
      <button disabled={readOnly} onClick={() => onChange({ ...node, children: [...node.children, { nodeType: "AND", children: [defaultCondition(), defaultCondition()] }] })}>+ Group</button>
      <button disabled={readOnly} onClick={() => onChange({ ...node, children: [...node.children, { nodeType: "NOT", child: defaultCondition() }] })}>+ NOT</button>
    </div>
    {node.children.map((child, idx) => <div key={idx} style={{ border: "1px solid #ddd", padding: 8, marginBottom: 8 }}>
      <NodeEditor node={child} value={child} onChange={(next) => onChange({ ...node, children: node.children.map((c, i) => (i === idx ? next : c)) })} readOnly={readOnly} />
      <button disabled={readOnly || node.children.length <= 2} onClick={() => onChange({ ...node, children: node.children.filter((_, i) => i !== idx) })}>Remove</button>
    </div>)}
  </div>;
}

export function RuleAstBuilder({ value, onChange, readOnly }: BuilderProps) {
  return <div>
    {(value.nodeType === "AND" || value.nodeType === "OR") ? <div style={{ marginBottom: 8 }}><label>Root operator: </label><select disabled={readOnly} value={value.nodeType} onChange={(e) => onChange({ ...value, nodeType: e.target.value as "AND" | "OR" })}><option value="AND">AND</option><option value="OR">OR</option></select></div> : null}
    <NodeEditor node={value} value={value} onChange={onChange} readOnly={readOnly} />
  </div>;
}
