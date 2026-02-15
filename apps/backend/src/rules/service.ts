import { Prisma, PrismaClient } from "@prisma/client";
import { createEtagFromParts } from "../httpEtag.js";
import { DEFAULT_FIELD_CATALOG, RuleOperator } from "./fieldCatalog.js";
import { validateRuleAst, RuleAstNode } from "./ast.js";
import { generateTemplateDescription } from "./description.js";
import { ApiError } from "../rulesets/service.js";

export interface SaveDraftRuleVersionInput {
  ruleId: string;
  versionNumber: number;
  logicAst: unknown;
  decision: Prisma.InputJsonValue;
  createdBy: string;
  changeSummary?: string;
  description?: string;
  manualDescriptionOverride?: boolean;
}

export function getRuleEtag(rule: { ruleId: string; lastUpdatedAt: Date }) {
  return createEtagFromParts([rule.ruleId, rule.lastUpdatedAt.toISOString()]);
}

export function getRuleVersionEtag(version: {
  ruleVersionId: string;
  status: string;
  logicAst: Prisma.JsonValue;
  decision: Prisma.JsonValue;
  description: string | null;
  changeSummary: string | null;
  descriptionSource: string;
}) {
  return createEtagFromParts([
    version.ruleVersionId,
    version.status,
    JSON.stringify(version.logicAst),
    JSON.stringify(version.decision),
    version.description,
    version.changeSummary,
    version.descriptionSource
  ]);
}

export async function getRuleDetail(prisma: PrismaClient, ruleId: string) {
  const rule = await prisma.rule.findUnique({
    where: { ruleId },
    include: { versions: { orderBy: { versionNumber: "desc" } } }
  });
  if (!rule) throw new ApiError(404, "rule not found");
  return {
    ...rule,
    versions: rule.versions.map((version) => ({
      ...version,
      etag: getRuleVersionEtag(version)
    }))
  };
}

export async function saveDraftRuleVersion(prisma: PrismaClient, input: SaveDraftRuleVersionInput) {
  const validatedAst = validateRuleAst(input.logicAst, DEFAULT_FIELD_CATALOG);
  const decision = input.decision as { action?: string };
  if (!decision.action) {
    throw new Error("decision.action is required");
  }

  const templateDescription = generateTemplateDescription(validatedAst, { action: decision.action });
  const useManualDescription = Boolean(input.manualDescriptionOverride && input.description);

  return prisma.ruleVersion.create({
    data: {
      ruleId: input.ruleId,
      versionNumber: input.versionNumber,
      status: "DRAFT",
      logicAst: validatedAst,
      decision: input.decision,
      changeSummary: input.changeSummary,
      createdBy: input.createdBy,
      description: useManualDescription ? input.description : templateDescription,
      descriptionSource: useManualDescription ? "MANUAL" : "TEMPLATE",
      descriptionGeneratedAt: useManualDescription ? null : new Date()
    }
  });
}

export async function patchRuleMetadata(prisma: PrismaClient, ruleId: string, input: { name?: string; description?: string; tags?: string[] }) {
  return prisma.rule.update({
    where: { ruleId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {})
    }
  });
}

export async function patchDraftRuleVersion(
  prisma: PrismaClient,
  ruleVersionId: string,
  input: { logicAst?: unknown; decision?: Prisma.InputJsonValue; changeSummary?: string; description?: string; manualDescriptionOverride?: boolean }
) {
  const current = await prisma.ruleVersion.findUnique({ where: { ruleVersionId } });
  if (!current) {
    throw new ApiError(404, "rule version not found");
  }
  if (current.status !== "DRAFT") {
    throw new ApiError(409, "only DRAFT rule versions can be edited");
  }

  const nextAst = input.logicAst !== undefined ? validateRuleAst(input.logicAst, DEFAULT_FIELD_CATALOG) : current.logicAst;
  const nextDecision = input.decision !== undefined ? input.decision : current.decision;
  const decision = nextDecision as { action?: string };
  if (!decision.action) {
    throw new ApiError(400, "decision.action is required");
  }

  const useManualDescription = Boolean(input.manualDescriptionOverride && input.description);
  const templateDescription = generateTemplateDescription(nextAst, { action: decision.action });

  return prisma.ruleVersion.update({
    where: { ruleVersionId },
    data: {
      logicAst: nextAst,
      decision: nextDecision,
      changeSummary: input.changeSummary ?? current.changeSummary,
      description: useManualDescription ? input.description : templateDescription,
      descriptionSource: useManualDescription ? "MANUAL" : "TEMPLATE",
      descriptionGeneratedAt: useManualDescription ? null : new Date()
    }
  });
}

function getPathValue(obj: unknown, fieldKey: string): unknown {
  return fieldKey.split(".").reduce<unknown>((acc, part) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[part];
  }, obj);
}

function compare(operator: RuleOperator, lhs: unknown, rhs: unknown): boolean {
  switch (operator) {
    case "EQ": return lhs === rhs;
    case "NEQ": return lhs !== rhs;
    case "GT": return Number(lhs) > Number(rhs);
    case "GTE": return Number(lhs) >= Number(rhs);
    case "LT": return Number(lhs) < Number(rhs);
    case "LTE": return Number(lhs) <= Number(rhs);
    case "IN": return Array.isArray(rhs) && rhs.includes(lhs as never);
    case "NOT_IN": return Array.isArray(rhs) && !rhs.includes(lhs as never);
    case "BETWEEN": return Array.isArray(rhs) && rhs.length === 2 && Number(lhs) >= Number(rhs[0]) && Number(lhs) <= Number(rhs[1]);
    case "NOT_BETWEEN": return Array.isArray(rhs) && rhs.length === 2 && (Number(lhs) < Number(rhs[0]) || Number(lhs) > Number(rhs[1]));
    case "IS_NULL": return lhs === null || lhs === undefined;
    case "IS_NOT_NULL": return lhs !== null && lhs !== undefined;
    case "IS_EMPTY": return lhs === "" || (Array.isArray(lhs) && lhs.length === 0);
    case "CONTAINS":
      return typeof lhs === "string" ? lhs.includes(String(rhs)) : Array.isArray(lhs) && lhs.includes(rhs as never);
    case "NOT_CONTAINS":
      return typeof lhs === "string" ? !lhs.includes(String(rhs)) : Array.isArray(lhs) && !lhs.includes(rhs as never);
    case "STARTS_WITH": return typeof lhs === "string" && lhs.startsWith(String(rhs));
    case "ENDS_WITH": return typeof lhs === "string" && lhs.endsWith(String(rhs));
    case "MATCHES_REGEX": return typeof lhs === "string" && new RegExp(String(rhs)).test(lhs);
    case "MEMBER_OF": return Array.isArray(rhs) && rhs.includes(lhs as never);
    case "NOT_MEMBER_OF": return Array.isArray(rhs) && !rhs.includes(lhs as never);
    default: return false;
  }
}

function evaluateNode(node: RuleAstNode, payload: unknown, trace: Array<Record<string, unknown>>): boolean {
  if (node.nodeType === "AND") return node.children.every((child) => evaluateNode(child, payload, trace));
  if (node.nodeType === "OR") return node.children.some((child) => evaluateNode(child, payload, trace));
  if (node.nodeType === "NOT") return !evaluateNode(node.child, payload, trace);

  const lhs = getPathValue(payload, node.fieldKey);
  const result = compare(node.operator, lhs, node.value);
  trace.push({ fieldKey: node.fieldKey, operator: node.operator, actual: lhs, expected: node.value, result });
  return result;
}

export async function tryRuleVersion(prisma: PrismaClient, ruleVersionId: string, payload: unknown) {
  const version = await prisma.ruleVersion.findUnique({ where: { ruleVersionId } });
  if (!version) throw new ApiError(404, "rule version not found");
  const trace: Array<Record<string, unknown>> = [];
  const matched = evaluateNode(version.logicAst as RuleAstNode, payload, trace);
  return { matched, trace };
}
