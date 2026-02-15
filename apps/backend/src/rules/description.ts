import { RuleAstNode } from "./ast.js";

export interface RuleDecision {
  action: string;
}

function formatValue(value: string | number | boolean): string {
  if (typeof value === "string") {
    return /^[A-Za-z0-9_.-]+$/.test(value) ? value : `"${value}"`;
  }
  return String(value);
}

function renderNode(node: RuleAstNode): string {
  if (node.nodeType === "AND" || node.nodeType === "OR") {
    const rendered = node.children.map((child) => renderNode(child));
    return rendered.join(` ${node.nodeType} `);
  }

  if (node.nodeType === "NOT") {
    const inner = renderNode(node.child);
    if (node.child.nodeType === "CONDITION") {
      return `NOT ${inner}`;
    }
    return `NOT (${inner})`;
  }

  const op = node.operator;
  if (op === "IS_NULL") return `${node.fieldKey} IS NULL`;
  if (op === "IS_NOT_NULL") return `${node.fieldKey} IS NOT NULL`;
  if (op === "IS_EMPTY") return `${node.fieldKey} IS EMPTY`;

  if (op === "BETWEEN" || op === "NOT_BETWEEN") {
    const values = node.value as [string | number | boolean, string | number | boolean];
    const keyword = op === "BETWEEN" ? "BETWEEN" : "NOT BETWEEN";
    return `${node.fieldKey} ${keyword} ${formatValue(values[0])} AND ${formatValue(values[1])}`;
  }

  if (op === "IN" || op === "NOT_IN" || op === "MEMBER_OF" || op === "NOT_MEMBER_OF") {
    const values = node.value as Array<string | number | boolean>;
    const verb = op.replace("_", " ");
    return `${node.fieldKey} ${verb} {${values.map(formatValue).join(",")}}`;
  }

  const operatorMap: Record<string, string> = {
    EQ: "=",
    NEQ: "!=",
    GT: ">",
    GTE: ">=",
    LT: "<",
    LTE: "<=",
    CONTAINS: "CONTAINS",
    NOT_CONTAINS: "NOT CONTAINS",
    STARTS_WITH: "STARTS WITH",
    ENDS_WITH: "ENDS WITH",
    MATCHES_REGEX: "MATCHES REGEX"
  };

  return `${node.fieldKey} ${operatorMap[op]} ${formatValue(node.value as string | number | boolean)}`;
}

export function generateTemplateDescription(ast: RuleAstNode, decision: RuleDecision): string {
  return `${decision.action.toUpperCase()} if ${renderNode(ast)}`;
}
