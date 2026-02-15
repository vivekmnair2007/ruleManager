import { ExecutionMode, Prisma, PrismaClient, RulesetVersionStatus } from "@prisma/client";

export class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

function requireDecisionPrecedenceForParallel(executionMode: ExecutionMode, decisionPrecedence: Prisma.JsonValue | null) {
  if (executionMode === "PARALLEL" && (decisionPrecedence === null || decisionPrecedence === undefined)) {
    throw new ApiError(400, "decisionPrecedence is required when executionMode is PARALLEL");
  }
}

function deriveRulesetStatus(statuses: RulesetVersionStatus[]): RulesetVersionStatus {
  if (statuses.includes("ACTIVE")) {
    return "ACTIVE";
  }
  if (statuses.includes("APPROVED")) {
    return "APPROVED";
  }
  return "DRAFT";
}

export async function createRulesetWithDraft(
  prisma: PrismaClient,
  input: {
    name: string;
    description: string;
    tags?: string[];
    executionMode: ExecutionMode;
    decisionPrecedence?: Prisma.JsonValue | null;
    createdBy: string;
  }
) {
  requireDecisionPrecedenceForParallel(input.executionMode, input.decisionPrecedence ?? null);

  return prisma.$transaction(async (tx) => {
    const ruleset = await tx.ruleset.create({
      data: {
        name: input.name,
        description: input.description,
        tags: input.tags ?? [],
        createdBy: input.createdBy
      }
    });

    const version = await tx.rulesetVersion.create({
      data: {
        rulesetId: ruleset.rulesetId,
        versionNumber: 1,
        status: "DRAFT",
        executionMode: input.executionMode,
        decisionPrecedence: input.decisionPrecedence ?? null,
        createdBy: input.createdBy
      }
    });

    return { ruleset, version };
  });
}

export async function listRulesets(prisma: PrismaClient) {
  return prisma.ruleset.findMany({
    orderBy: { createdAt: "desc" }
  });
}

export async function getRulesetDetail(prisma: PrismaClient, rulesetId: string) {
  const ruleset = await prisma.ruleset.findUnique({
    where: { rulesetId },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" }
      }
    }
  });

  if (!ruleset) {
    throw new ApiError(404, "ruleset not found");
  }

  return {
    ...ruleset,
    derivedStatus: deriveRulesetStatus(ruleset.versions.map((v) => v.status))
  };
}

export async function createRulesetVersion(prisma: PrismaClient, rulesetId: string, createdBy: string) {
  return prisma.$transaction(async (tx) => {
    const latest = await tx.rulesetVersion.findFirst({
      where: { rulesetId },
      orderBy: { versionNumber: "desc" },
      include: { entries: true }
    });

    if (!latest) {
      throw new ApiError(404, "ruleset not found or has no versions");
    }

    const nextVersion = await tx.rulesetVersion.create({
      data: {
        rulesetId,
        versionNumber: latest.versionNumber + 1,
        status: "DRAFT",
        executionMode: latest.executionMode,
        decisionPrecedence: latest.decisionPrecedence,
        createdBy
      }
    });

    if (latest.entries.length > 0) {
      await tx.rulesetEntry.createMany({
        data: latest.entries.map((entry) => ({
          rulesetVersionId: nextVersion.rulesetVersionId,
          ruleId: entry.ruleId,
          ruleVersionId: entry.ruleVersionId,
          enabled: entry.enabled,
          orderPriority: entry.orderPriority
        }))
      });
    }

    return nextVersion;
  });
}

export async function updateRulesetVersionSettings(
  prisma: PrismaClient,
  rulesetVersionId: string,
  input: { executionMode?: ExecutionMode; decisionPrecedence?: Prisma.JsonValue | null }
) {
  const current = await prisma.rulesetVersion.findUnique({ where: { rulesetVersionId } });
  if (!current) {
    throw new ApiError(404, "ruleset version not found");
  }
  if (current.status !== "DRAFT") {
    throw new ApiError(409, "only DRAFT ruleset versions can be edited");
  }

  const executionMode = input.executionMode ?? current.executionMode;
  const decisionPrecedence = input.decisionPrecedence !== undefined ? input.decisionPrecedence : current.decisionPrecedence;
  requireDecisionPrecedenceForParallel(executionMode, decisionPrecedence);

  return prisma.rulesetVersion.update({
    where: { rulesetVersionId },
    data: {
      executionMode,
      decisionPrecedence
    }
  });
}

export async function approveRulesetVersion(prisma: PrismaClient, rulesetVersionId: string, actor: string) {
  const current = await prisma.rulesetVersion.findUnique({ where: { rulesetVersionId } });
  if (!current) {
    throw new ApiError(404, "ruleset version not found");
  }
  if (current.status !== "DRAFT") {
    throw new ApiError(409, "only DRAFT ruleset versions can be approved");
  }

  return prisma.rulesetVersion.update({
    where: { rulesetVersionId },
    data: {
      status: "APPROVED",
      approvedBy: actor,
      approvedAt: new Date()
    }
  });
}

async function activateRulesetVersionInternal(prisma: PrismaClient, rulesetVersionId: string, actor: string, expectedRulesetId?: string) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.rulesetVersion.findUnique({ where: { rulesetVersionId } });
    if (!target) {
      throw new ApiError(404, "ruleset version not found");
    }
    if (expectedRulesetId && target.rulesetId !== expectedRulesetId) {
      throw new ApiError(400, "rulesetVersionId does not belong to the specified ruleset");
    }
    if (target.status !== "APPROVED") {
      throw new ApiError(409, "only APPROVED versions can be activated");
    }

    await tx.rulesetVersion.updateMany({
      where: {
        rulesetId: target.rulesetId,
        status: "ACTIVE",
        NOT: { rulesetVersionId }
      },
      data: {
        status: "APPROVED",
        activatedAt: null,
        activatedBy: null
      }
    });

    return tx.rulesetVersion.update({
      where: { rulesetVersionId },
      data: {
        status: "ACTIVE",
        activatedAt: new Date(),
        activatedBy: actor
      }
    });
  });
}

export async function activateRulesetVersion(prisma: PrismaClient, rulesetVersionId: string, actor: string) {
  return activateRulesetVersionInternal(prisma, rulesetVersionId, actor);
}

export async function rollbackActivateRulesetVersion(
  prisma: PrismaClient,
  rulesetId: string,
  rulesetVersionId: string,
  actor: string
) {
  return activateRulesetVersionInternal(prisma, rulesetVersionId, actor, rulesetId);
}

export async function addRulesetEntry(
  prisma: PrismaClient,
  rulesetVersionId: string,
  input: { ruleVersionId: string; enabled?: boolean; orderPriority?: number }
) {
  const rulesetVersion = await prisma.rulesetVersion.findUnique({ where: { rulesetVersionId } });
  if (!rulesetVersion) {
    throw new ApiError(404, "ruleset version not found");
  }
  if (rulesetVersion.status !== "DRAFT") {
    throw new ApiError(409, "entries can only be added to DRAFT ruleset versions");
  }
  if (rulesetVersion.executionMode === "PARALLEL" && !rulesetVersion.decisionPrecedence) {
    throw new ApiError(400, "decisionPrecedence must be defined for PARALLEL execution mode");
  }

  const ruleVersion = await prisma.ruleVersion.findUnique({
    where: { ruleVersionId: input.ruleVersionId },
    include: { rule: true }
  });
  if (!ruleVersion) {
    throw new ApiError(404, "rule version not found");
  }

  if (ruleVersion.rule.archivedAt) {
    throw new ApiError(400, "cannot add an archived rule");
  }

  if (rulesetVersion.status !== "DRAFT" && ruleVersion.status === "DRAFT") {
    throw new ApiError(400, "cannot add DRAFT rule_version to non-draft ruleset_version");
  }

  const existing = await prisma.rulesetEntry.findFirst({
    where: {
      rulesetVersionId,
      ruleVersionId: ruleVersion.ruleVersionId
    }
  });

  if (existing) {
    throw new ApiError(409, "duplicate ruleVersionId in ruleset version");
  }

  if (rulesetVersion.executionMode === "SEQUENTIAL") {
    if (input.orderPriority === undefined || input.orderPriority === null) {
      throw new ApiError(400, "orderPriority is required for SEQUENTIAL execution mode");
    }

    const takenOrder = await prisma.rulesetEntry.findFirst({
      where: {
        rulesetVersionId,
        orderPriority: input.orderPriority
      }
    });
    if (takenOrder) {
      throw new ApiError(409, "orderPriority must be unique within a SEQUENTIAL draft ruleset version");
    }
  }

  return prisma.rulesetEntry.create({
    data: {
      rulesetVersionId,
      ruleId: ruleVersion.ruleId,
      ruleVersionId: ruleVersion.ruleVersionId,
      enabled: input.enabled ?? true,
      orderPriority: rulesetVersion.executionMode === "SEQUENTIAL" ? input.orderPriority ?? null : null
    }
  });
}

export async function patchRulesetEntry(
  prisma: PrismaClient,
  entryId: string,
  input: { enabled?: boolean; orderPriority?: number }
) {
  const entry = await prisma.rulesetEntry.findUnique({
    where: { entryId },
    include: { rulesetVersion: true }
  });
  if (!entry) {
    throw new ApiError(404, "entry not found");
  }
  if (entry.rulesetVersion.status !== "DRAFT") {
    throw new ApiError(409, "entry can only be edited in DRAFT ruleset versions");
  }

  const data: { enabled?: boolean; orderPriority?: number | null } = {};
  if (input.enabled !== undefined) {
    data.enabled = input.enabled;
  }

  if (input.orderPriority !== undefined) {
    if (entry.rulesetVersion.executionMode !== "SEQUENTIAL") {
      throw new ApiError(400, "orderPriority can only be changed for SEQUENTIAL mode");
    }

    const conflict = await prisma.rulesetEntry.findFirst({
      where: {
        rulesetVersionId: entry.rulesetVersionId,
        orderPriority: input.orderPriority,
        NOT: { entryId }
      }
    });
    if (conflict) {
      throw new ApiError(409, "orderPriority must be unique within a SEQUENTIAL draft ruleset version");
    }

    data.orderPriority = input.orderPriority;
  }

  return prisma.rulesetEntry.update({
    where: { entryId },
    data
  });
}

export async function deleteRulesetEntry(prisma: PrismaClient, entryId: string) {
  const entry = await prisma.rulesetEntry.findUnique({
    where: { entryId },
    include: { rulesetVersion: true }
  });

  if (!entry) {
    throw new ApiError(404, "entry not found");
  }
  if (entry.rulesetVersion.status !== "DRAFT") {
    throw new ApiError(409, "entry can only be deleted in DRAFT ruleset versions");
  }

  await prisma.rulesetEntry.delete({ where: { entryId } });
}
