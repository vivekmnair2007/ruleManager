import { PrismaClient, RuleType, RuleVersionStatus, ExecutionMode, RulesetVersionStatus } from "@prisma/client";

const prisma = new PrismaClient();
const DEMO_ACTOR = "demo@rule-manager.local";

async function main(): Promise<void> {
  const velocityRule = await prisma.rule.create({
    data: {
      name: "High Transaction Velocity",
      description: "Flags users with too many transactions in a short interval.",
      type: RuleType.FRAUD,
      tags: ["velocity", "risk"],
      createdBy: DEMO_ACTOR
    }
  });

  const amountRule = await prisma.rule.create({
    data: {
      name: "Large Amount Review",
      description: "Flags transactions above a configurable amount threshold.",
      type: RuleType.BUSINESS,
      tags: ["amount", "review"],
      createdBy: DEMO_ACTOR
    }
  });

  const velocityRuleVersion = await prisma.ruleVersion.create({
    data: {
      ruleId: velocityRule.ruleId,
      versionNumber: 1,
      status: RuleVersionStatus.DRAFT,
      logicAst: { op: ">", field: "tx_count_10m", value: 5 },
      decision: { action: "REVIEW", reason: "velocity_limit_exceeded" },
      changeSummary: "Initial draft",
      createdBy: DEMO_ACTOR
    }
  });

  const amountRuleVersion = await prisma.ruleVersion.create({
    data: {
      ruleId: amountRule.ruleId,
      versionNumber: 1,
      status: RuleVersionStatus.DRAFT,
      logicAst: { op: ">=", field: "amount", value: 10000 },
      decision: { action: "REVIEW", reason: "large_amount" },
      changeSummary: "Initial draft",
      createdBy: DEMO_ACTOR
    }
  });

  const ruleset = await prisma.ruleset.create({
    data: {
      name: "Default Risk Ruleset",
      description: "Initial ruleset for risk checks.",
      tags: ["default", "risk"],
      createdBy: DEMO_ACTOR
    }
  });

  const rulesetVersion = await prisma.rulesetVersion.create({
    data: {
      rulesetId: ruleset.rulesetId,
      versionNumber: 1,
      status: RulesetVersionStatus.DRAFT,
      executionMode: ExecutionMode.SEQUENTIAL,
      createdBy: DEMO_ACTOR
    }
  });

  await prisma.rulesetEntry.createMany({
    data: [
      {
        rulesetVersionId: rulesetVersion.rulesetVersionId,
        ruleId: velocityRule.ruleId,
        ruleVersionId: velocityRuleVersion.ruleVersionId,
        enabled: true,
        orderPriority: 1
      },
      {
        rulesetVersionId: rulesetVersion.rulesetVersionId,
        ruleId: amountRule.ruleId,
        ruleVersionId: amountRuleVersion.ruleVersionId,
        enabled: true,
        orderPriority: 2
      }
    ]
  });

  console.log("Seed complete: created 1 ruleset, 2 rules, and draft versions.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
