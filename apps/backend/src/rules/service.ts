import { Prisma, PrismaClient } from "@prisma/client";
import { createEtagFromParts } from "../httpEtag.js";
import { DEFAULT_FIELD_CATALOG } from "./fieldCatalog.js";
import { validateRuleAst } from "./ast.js";
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
