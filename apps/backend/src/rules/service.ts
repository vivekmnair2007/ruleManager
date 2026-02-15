import { Prisma, PrismaClient } from "@prisma/client";
import { DEFAULT_FIELD_CATALOG } from "./fieldCatalog.js";
import { validateRuleAst } from "./ast.js";
import { generateTemplateDescription } from "./description.js";

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
