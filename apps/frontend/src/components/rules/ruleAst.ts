export type FieldType = "NUMBER" | "STRING" | "BOOLEAN" | "DATETIME" | "ENUM" | "LIST";
export type RuleOperator =
  | "EQ" | "NEQ" | "GT" | "GTE" | "LT" | "LTE"
  | "IN" | "NOT_IN" | "BETWEEN" | "NOT_BETWEEN"
  | "IS_NULL" | "IS_NOT_NULL" | "IS_EMPTY"
  | "CONTAINS" | "NOT_CONTAINS" | "STARTS_WITH" | "ENDS_WITH" | "MATCHES_REGEX"
  | "MEMBER_OF" | "NOT_MEMBER_OF";

export type ConditionNode = { nodeType: "CONDITION"; fieldKey: string; operator: RuleOperator; value?: string | number | boolean | Array<string | number | boolean> };
export type RuleAstNode =
  | { nodeType: "AND" | "OR"; children: RuleAstNode[] }
  | { nodeType: "NOT"; child: RuleAstNode }
  | ConditionNode;

export interface FieldDefinition { fieldKey: string; label: string; type: FieldType }

export const FIELD_CATALOG: FieldDefinition[] = [
  { fieldKey: "txn.amount", label: "Transaction Amount", type: "NUMBER" },
  { fieldKey: "txn.mcc", label: "Merchant Category", type: "ENUM" },
  { fieldKey: "card.present", label: "Card Present", type: "BOOLEAN" },
  { fieldKey: "txn.timestamp", label: "Transaction Timestamp", type: "DATETIME" },
  { fieldKey: "account.tags", label: "Account Tags", type: "LIST" },
  { fieldKey: "txn.country", label: "Transaction Country", type: "STRING" }
];

export const OPERATORS_BY_TYPE: Record<FieldType, RuleOperator[]> = {
  NUMBER: ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "IN", "NOT_IN", "BETWEEN", "NOT_BETWEEN", "IS_NULL", "IS_NOT_NULL"],
  DATETIME: ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "BETWEEN", "NOT_BETWEEN", "IS_NULL", "IS_NOT_NULL"],
  STRING: ["EQ", "NEQ", "IN", "NOT_IN", "IS_NULL", "IS_NOT_NULL", "IS_EMPTY", "CONTAINS", "NOT_CONTAINS", "STARTS_WITH", "ENDS_WITH", "MATCHES_REGEX"],
  BOOLEAN: ["EQ", "NEQ", "IS_NULL", "IS_NOT_NULL"],
  ENUM: ["EQ", "NEQ", "IN", "NOT_IN", "IS_NULL", "IS_NOT_NULL"],
  LIST: ["IS_EMPTY", "CONTAINS", "NOT_CONTAINS", "MEMBER_OF", "NOT_MEMBER_OF", "IS_NULL", "IS_NOT_NULL"]
};

export const OPERATOR_LABEL: Record<RuleOperator, string> = {
  EQ: "=", NEQ: "!=", GT: ">", GTE: ">=", LT: "<", LTE: "<=", IN: "IN", NOT_IN: "NOT IN", BETWEEN: "BETWEEN", NOT_BETWEEN: "NOT BETWEEN", IS_NULL: "IS NULL", IS_NOT_NULL: "IS NOT NULL", IS_EMPTY: "IS EMPTY", CONTAINS: "CONTAINS", NOT_CONTAINS: "NOT CONTAINS", STARTS_WITH: "STARTS WITH", ENDS_WITH: "ENDS WITH", MATCHES_REGEX: "MATCHES REGEX", MEMBER_OF: "MEMBER OF", NOT_MEMBER_OF: "NOT MEMBER OF"
};

export const defaultCondition = (): RuleAstNode => ({ nodeType: "CONDITION", fieldKey: FIELD_CATALOG[0].fieldKey, operator: "EQ", value: 0 });
export const defaultAst = (): RuleAstNode => ({ nodeType: "AND", children: [defaultCondition(), defaultCondition()] });

function renderCondition(node: ConditionNode): string {
  if (node.operator === "IS_NULL" || node.operator === "IS_NOT_NULL" || node.operator === "IS_EMPTY") return `${node.fieldKey} ${OPERATOR_LABEL[node.operator]}`;
  const value = Array.isArray(node.value) ? `{${node.value.join(",")}}` : String(node.value ?? "");
  return `${node.fieldKey} ${OPERATOR_LABEL[node.operator]} ${value}`;
}

function renderNode(node: RuleAstNode): string {
  switch (node.nodeType) {
    case "AND":
    case "OR":
      return node.children.map(renderNode).join(` ${node.nodeType} `);
    case "NOT":
      return `NOT (${renderNode(node.child)})`;
    case "CONDITION":
      return renderCondition(node);
  }
}

export function generateRulePreview(ast: RuleAstNode, action: string) {
  return `${action} if ${renderNode(ast)}`;
}
