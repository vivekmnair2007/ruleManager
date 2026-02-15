import { z } from "zod";
import { FieldCatalog, FieldType, RuleOperator } from "./fieldCatalog.js";

const scalarValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const comparisonSchema = z.object({
  nodeType: z.literal("CONDITION"),
  operator: z.enum([
    "EQ",
    "NEQ",
    "GT",
    "GTE",
    "LT",
    "LTE",
    "IN",
    "NOT_IN",
    "BETWEEN",
    "NOT_BETWEEN",
    "IS_NULL",
    "IS_NOT_NULL",
    "IS_EMPTY",
    "CONTAINS",
    "NOT_CONTAINS",
    "STARTS_WITH",
    "ENDS_WITH",
    "MATCHES_REGEX",
    "MEMBER_OF",
    "NOT_MEMBER_OF"
  ]),
  fieldKey: z.string().min(1),
  value: z.union([scalarValueSchema, z.array(scalarValueSchema), z.tuple([scalarValueSchema, scalarValueSchema])]).optional()
});

const logicalNodeSchema: z.ZodType<RuleAstNode> = z.lazy(() =>
  z.discriminatedUnion("nodeType", [
    z.object({ nodeType: z.literal("AND"), children: z.array(logicalNodeSchema).min(2) }),
    z.object({ nodeType: z.literal("OR"), children: z.array(logicalNodeSchema).min(2) }),
    z.object({ nodeType: z.literal("NOT"), child: logicalNodeSchema }),
    comparisonSchema
  ])
);

export const ruleAstSchema = logicalNodeSchema;

export type RuleConditionNode = z.infer<typeof comparisonSchema>;
export type RuleAstNode =
  | { nodeType: "AND"; children: RuleAstNode[] }
  | { nodeType: "OR"; children: RuleAstNode[] }
  | { nodeType: "NOT"; child: RuleAstNode }
  | RuleConditionNode;

const unaryNoValueOperators: RuleOperator[] = ["IS_NULL", "IS_NOT_NULL", "IS_EMPTY"];
const arrayValueOperators: RuleOperator[] = ["IN", "NOT_IN", "MEMBER_OF", "NOT_MEMBER_OF"];
const rangeOperators: RuleOperator[] = ["BETWEEN", "NOT_BETWEEN"];
const stringOnlyOperators: RuleOperator[] = ["CONTAINS", "NOT_CONTAINS", "STARTS_WITH", "ENDS_WITH", "MATCHES_REGEX"];

function validateValueType(fieldType: FieldType, value: string | number | boolean): boolean {
  if (fieldType === "NUMBER") {
    return typeof value === "number";
  }
  if (fieldType === "BOOLEAN") {
    return typeof value === "boolean";
  }
  return typeof value === "string";
}

function validateCondition(condition: RuleConditionNode, fieldCatalog: FieldCatalog): void {
  const field = fieldCatalog.require(condition.fieldKey);

  if (!fieldCatalog.isOperatorAllowed(condition.fieldKey, condition.operator)) {
    throw new Error(`Operator ${condition.operator} is not allowed for field type ${field.type}`);
  }

  if (unaryNoValueOperators.includes(condition.operator)) {
    if (condition.value !== undefined) {
      throw new Error(`Operator ${condition.operator} does not allow a value payload`);
    }
    return;
  }

  if (rangeOperators.includes(condition.operator)) {
    if (!Array.isArray(condition.value) || condition.value.length !== 2) {
      throw new Error(`Operator ${condition.operator} requires a two-item range`);
    }
    if (!validateValueType(field.type, condition.value[0]) || !validateValueType(field.type, condition.value[1])) {
      throw new Error(`Range values are invalid for field type ${field.type}`);
    }
    return;
  }

  if (arrayValueOperators.includes(condition.operator)) {
    if (!Array.isArray(condition.value) || condition.value.length === 0) {
      throw new Error(`Operator ${condition.operator} requires a non-empty list value`);
    }
    for (const item of condition.value) {
      if (!validateValueType(field.type === "LIST" ? "STRING" : field.type, item)) {
        throw new Error(`List value type is invalid for field ${condition.fieldKey}`);
      }
    }
    return;
  }

  if (condition.value === undefined || Array.isArray(condition.value)) {
    throw new Error(`Operator ${condition.operator} requires a scalar value`);
  }

  if (stringOnlyOperators.includes(condition.operator) && field.type !== "STRING" && field.type !== "LIST") {
    throw new Error(`Operator ${condition.operator} requires STRING or LIST field type`);
  }

  if (!validateValueType(field.type === "LIST" ? "STRING" : field.type, condition.value)) {
    throw new Error(`Value type is invalid for field type ${field.type}`);
  }
}

function walk(node: RuleAstNode, fieldCatalog: FieldCatalog): void {
  if (node.nodeType === "AND" || node.nodeType === "OR") {
    node.children.forEach((child) => walk(child, fieldCatalog));
    return;
  }
  if (node.nodeType === "NOT") {
    walk(node.child, fieldCatalog);
    return;
  }
  validateCondition(node, fieldCatalog);
}

export function validateRuleAst(input: unknown, fieldCatalog: FieldCatalog): RuleAstNode {
  const parsed = ruleAstSchema.parse(input);
  walk(parsed, fieldCatalog);
  return parsed;
}
