import assert from "node:assert/strict";
import {
  activateRulesetVersion,
  addRulesetEntry,
  ApiError,
  updateRulesetVersionSettings
} from "./service.js";

type RulesetVersion = {
  rulesetVersionId: string;
  rulesetId: string;
  versionNumber: number;
  status: "DRAFT" | "APPROVED" | "ACTIVE";
  executionMode: "SEQUENTIAL" | "PARALLEL";
  decisionPrecedence: unknown;
  createdBy: string;
  createdAt: Date;
  approvedBy: string | null;
  approvedAt: Date | null;
  activatedBy: string | null;
  activatedAt: Date | null;
};

type RuleVersion = {
  ruleVersionId: string;
  ruleId: string;
  status: "DRAFT" | "APPROVED";
  rule: { archivedAt: Date | null };
};

type Entry = {
  entryId: string;
  rulesetVersionId: string;
  ruleId: string;
  ruleVersionId: string;
  enabled: boolean;
  orderPriority: number | null;
};

function makePrismaFixture() {
  const rulesetVersions: RulesetVersion[] = [
    {
      rulesetVersionId: "rv1",
      rulesetId: "rs1",
      versionNumber: 1,
      status: "ACTIVE",
      executionMode: "SEQUENTIAL",
      decisionPrecedence: null,
      createdBy: "a",
      createdAt: new Date(),
      approvedBy: "a",
      approvedAt: new Date(),
      activatedBy: "a",
      activatedAt: new Date()
    },
    {
      rulesetVersionId: "rv2",
      rulesetId: "rs1",
      versionNumber: 2,
      status: "APPROVED",
      executionMode: "SEQUENTIAL",
      decisionPrecedence: null,
      createdBy: "a",
      createdAt: new Date(),
      approvedBy: "a",
      approvedAt: new Date(),
      activatedBy: null,
      activatedAt: null
    }
  ];

  const ruleVersions: RuleVersion[] = [
    { ruleVersionId: "rule-v1", ruleId: "rule-1", status: "APPROVED", rule: { archivedAt: null } }
  ];

  const entries: Entry[] = [];

  const prisma = {
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(prisma),
    rulesetVersion: {
      findUnique: async ({ where: { rulesetVersionId } }: any) => rulesetVersions.find((v) => v.rulesetVersionId === rulesetVersionId) ?? null,
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const v of rulesetVersions) {
          if (v.rulesetId === where.rulesetId && v.status === where.status && v.rulesetVersionId !== where.NOT.rulesetVersionId) {
            v.status = data.status;
            v.activatedAt = data.activatedAt;
            v.activatedBy = data.activatedBy;
            count += 1;
          }
        }
        return { count };
      },
      update: async ({ where: { rulesetVersionId }, data }: any) => {
        const found = rulesetVersions.find((v) => v.rulesetVersionId === rulesetVersionId);
        if (!found) {
          throw new Error("missing");
        }
        Object.assign(found, data);
        return found;
      }
    },
    ruleVersion: {
      findUnique: async ({ where: { ruleVersionId } }: any) => ruleVersions.find((v) => v.ruleVersionId === ruleVersionId) ?? null
    },
    rulesetEntry: {
      findFirst: async ({ where }: any) =>
        entries.find((e) => e.rulesetVersionId === where.rulesetVersionId && (where.ruleVersionId ? e.ruleVersionId === where.ruleVersionId : e.orderPriority === where.orderPriority)) ?? null,
      create: async ({ data }: any) => {
        const created: Entry = { entryId: `e${entries.length + 1}`, ...data };
        entries.push(created);
        return created;
      }
    }
  };

  return { prisma, rulesetVersions, entries };
}

{
  const { prisma, rulesetVersions } = makePrismaFixture();
  await activateRulesetVersion(prisma as any, "rv2", "actor");
  assert.equal(rulesetVersions.find((v) => v.rulesetVersionId === "rv2")?.status, "ACTIVE");
  assert.equal(rulesetVersions.filter((v) => v.rulesetId === "rs1" && v.status === "ACTIVE").length, 1);
}

{
  const { prisma, rulesetVersions } = makePrismaFixture();
  rulesetVersions[0].status = "APPROVED";
  await assert.rejects(() => updateRulesetVersionSettings(prisma as any, "rv1", { executionMode: "SEQUENTIAL" }), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.statusCode, 409);
    return true;
  });
}

{
  const { prisma } = makePrismaFixture();
  await assert.rejects(() => addRulesetEntry(prisma as any, "rv1", { ruleVersionId: "rule-v1" }), /DRAFT ruleset versions/);
}

{
  const { prisma, rulesetVersions, entries } = makePrismaFixture();
  rulesetVersions[0].status = "DRAFT";
  await assert.rejects(() => addRulesetEntry(prisma as any, "rv1", { ruleVersionId: "rule-v1" }), /orderPriority is required/);

  const created = await addRulesetEntry(prisma as any, "rv1", { ruleVersionId: "rule-v1", orderPriority: 10 });
  assert.equal(created.orderPriority, 10);

  await assert.rejects(() => addRulesetEntry(prisma as any, "rv1", { ruleVersionId: "rule-v1", orderPriority: 11 }), /duplicate ruleVersionId/);
  assert.equal(entries.length, 1);
}

console.log("rulesets.test.ts: all assertions passed");
