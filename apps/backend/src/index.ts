import express from "express";
import { env } from "./config.js";
import { attachDemoUser } from "./auth/demoAuth.js";
import { prisma } from "./db.js";
import { stripWeakEtag } from "./httpEtag.js";
import {
  getRuleEtag,
  getRuleVersionEtag,
  patchDraftRuleVersion,
  patchRuleMetadata,
  saveDraftRuleVersion
} from "./rules/service.js";
import {
  addRulesetEntry,
  ApiError,
  approveRulesetVersion,
  activateRulesetVersion,
  createRulesetVersion,
  createRulesetWithDraft,
  deleteRulesetEntry,
  getRulesetDetail,
  getRulesetEntryEtag,
  getRulesetTable,
  getRulesetTableEntries,
  getRulesetVersionEtag,
  listRulesets,
  patchRulesetEntry,
  rollbackActivateRulesetVersion,
  updateRulesetVersionSettings
} from "./rulesets/service.js";

const app = express();
app.use(express.json());
app.use(attachDemoUser);

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.get("/me", (req, res) => res.json({ user: (req as typeof req & { user?: unknown }).user }));

async function assertIfMatch(
  req: express.Request,
  res: express.Response,
  etag: string,
  resource: Record<string, unknown>
) {
  const ifMatch = stripWeakEtag(req.header("if-match"));
  if (!ifMatch || ifMatch !== etag) {
    res.status(412).json({
      error: "ETAG_MISMATCH",
      message: "Resource changed since you loaded it",
      serverEtag: etag,
      resource
    });
    return false;
  }
  return true;
}

app.post("/rule-versions/draft", async (req, res) => {
  try {
    const user = (req as typeof req & { user?: { email?: string } }).user;
    const draft = await saveDraftRuleVersion(prisma, {
      ruleId: req.body.ruleId,
      versionNumber: req.body.versionNumber,
      logicAst: req.body.logicAst,
      decision: req.body.decision,
      changeSummary: req.body.changeSummary,
      description: req.body.description,
      manualDescriptionOverride: req.body.manualDescriptionOverride,
      createdBy: user?.email ?? "unknown"
    });
    const etag = getRuleVersionEtag(draft);
    res.setHeader("ETag", etag);
    res.status(201).json({ ruleVersionId: draft.ruleVersionId, description: draft.description, descriptionSource: draft.descriptionSource });
  } catch (error) {
    handleError(res, error);
  }
});

app.patch("/v1/rules/:ruleId", async (req, res) => {
  try {
    const current = await prisma.rule.findUnique({ where: { ruleId: req.params.ruleId } });
    if (!current) throw new ApiError(404, "rule not found");
    const currentEtag = getRuleEtag(current);
    if (!(await assertIfMatch(req, res, currentEtag, { ruleId: current.ruleId, name: current.name, lastUpdatedAt: current.lastUpdatedAt }))) return;

    const updated = await patchRuleMetadata(prisma, req.params.ruleId, {
      name: req.body.name,
      description: req.body.description,
      tags: req.body.tags
    });
    res.setHeader("ETag", getRuleEtag(updated));
    res.json(updated);
  } catch (error) {
    handleError(res, error);
  }
});

app.patch("/v1/rule-versions/:ruleVersionId", async (req, res) => {
  try {
    const current = await prisma.ruleVersion.findUnique({ where: { ruleVersionId: req.params.ruleVersionId } });
    if (!current) throw new ApiError(404, "rule version not found");
    const currentEtag = getRuleVersionEtag(current);
    if (!(await assertIfMatch(req, res, currentEtag, { ruleVersionId: current.ruleVersionId, status: current.status }))) return;

    const updated = await patchDraftRuleVersion(prisma, req.params.ruleVersionId, req.body);
    res.setHeader("ETag", getRuleVersionEtag(updated));
    res.json(updated);
  } catch (error) {
    handleError(res, error);
  }
});

app.post("/v1/rulesets", async (req, res) => {
  try {
    const user = (req as typeof req & { user?: { email?: string } }).user;
    const result = await createRulesetWithDraft(prisma, {
      name: req.body.name,
      description: req.body.description,
      tags: req.body.tags,
      executionMode: req.body.executionMode,
      decisionPrecedence: req.body.decisionPrecedence,
      createdBy: user?.email ?? "unknown"
    });
    res.setHeader("ETag", getRulesetVersionEtag(result.version));
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error);
  }
});

app.get("/v1/rulesets", async (_req, res) => {
  try { res.json({ items: await listRulesets(prisma) }); } catch (error) { handleError(res, error); }
});

app.get("/v1/rulesets/:rulesetId", async (req, res) => {
  try { res.json(await getRulesetDetail(prisma, req.params.rulesetId)); } catch (error) { handleError(res, error); }
});

app.post("/v1/rulesets/:rulesetId/versions", async (req, res) => {
  try {
    const user = (req as typeof req & { user?: { email?: string } }).user;
    const version = await createRulesetVersion(prisma, req.params.rulesetId, user?.email ?? "unknown");
    res.setHeader("ETag", getRulesetVersionEtag(version));
    res.status(201).json(version);
  } catch (error) {
    handleError(res, error);
  }
});

app.patch("/v1/ruleset-versions/:rulesetVersionId", async (req, res) => {
  try {
    const current = await prisma.rulesetVersion.findUnique({ where: { rulesetVersionId: req.params.rulesetVersionId } });
    if (!current) throw new ApiError(404, "ruleset version not found");
    const etag = getRulesetVersionEtag(current);
    if (!(await assertIfMatch(req, res, etag, { rulesetVersionId: current.rulesetVersionId, status: current.status }))) return;

    const version = await updateRulesetVersionSettings(prisma, req.params.rulesetVersionId, {
      executionMode: req.body.executionMode,
      decisionPrecedence: req.body.decisionPrecedence
    });
    res.setHeader("ETag", getRulesetVersionEtag(version));
    res.json(version);
  } catch (error) {
    handleError(res, error);
  }
});

app.post(/^\/v1\/ruleset-versions\/([^/]+):approve$/, async (req, res) => {
  try {
    const rulesetVersionId = req.params[0];
    const current = await prisma.rulesetVersion.findUnique({ where: { rulesetVersionId } });
    if (!current) throw new ApiError(404, "ruleset version not found");
    if (!(await assertIfMatch(req, res, getRulesetVersionEtag(current), { rulesetVersionId: current.rulesetVersionId, status: current.status }))) return;

    const user = (req as typeof req & { user?: { email?: string } }).user;
    const version = await approveRulesetVersion(prisma, rulesetVersionId, user?.email ?? "unknown");
    res.setHeader("ETag", getRulesetVersionEtag(version));
    res.json(version);
  } catch (error) {
    handleError(res, error);
  }
});

app.post(/^\/v1\/ruleset-versions\/([^/]+):activate$/, async (req, res) => {
  try {
    const rulesetVersionId = req.params[0];
    const current = await prisma.rulesetVersion.findUnique({ where: { rulesetVersionId } });
    if (!current) throw new ApiError(404, "ruleset version not found");
    if (!(await assertIfMatch(req, res, getRulesetVersionEtag(current), { rulesetVersionId: current.rulesetVersionId, status: current.status }))) return;

    const user = (req as typeof req & { user?: { email?: string } }).user;
    const version = await activateRulesetVersion(prisma, rulesetVersionId, user?.email ?? "unknown");
    res.setHeader("ETag", getRulesetVersionEtag(version));
    res.json(version);
  } catch (error) {
    handleError(res, error);
  }
});

app.post(/^\/v1\/rulesets\/([^/]+):activateVersion$/, async (req, res) => {
  try {
    const target = await prisma.rulesetVersion.findUnique({ where: { rulesetVersionId: req.body.rulesetVersionId } });
    if (!target) throw new ApiError(404, "ruleset version not found");
    if (!(await assertIfMatch(req, res, getRulesetVersionEtag(target), { rulesetVersionId: target.rulesetVersionId, status: target.status }))) return;

    const user = (req as typeof req & { user?: { email?: string } }).user;
    const version = await rollbackActivateRulesetVersion(prisma, req.params[0], req.body.rulesetVersionId, user?.email ?? "unknown");
    res.setHeader("ETag", getRulesetVersionEtag(version));
    res.json(version);
  } catch (error) {
    handleError(res, error);
  }
});

app.post("/v1/ruleset-versions/:rulesetVersionId/entries", async (req, res) => {
  try {
    const parent = await prisma.rulesetVersion.findUnique({ where: { rulesetVersionId: req.params.rulesetVersionId } });
    if (!parent) throw new ApiError(404, "ruleset version not found");
    if (!(await assertIfMatch(req, res, getRulesetVersionEtag(parent), { rulesetVersionId: parent.rulesetVersionId, status: parent.status }))) return;

    const entry = await addRulesetEntry(prisma, req.params.rulesetVersionId, {
      ruleVersionId: req.body.ruleVersionId,
      enabled: req.body.enabled,
      orderPriority: req.body.orderPriority
    });
    res.setHeader("ETag", getRulesetEntryEtag(entry));
    res.status(201).json(entry);
  } catch (error) {
    handleError(res, error);
  }
});

app.patch("/v1/ruleset-entries/:entryId", async (req, res) => {
  try {
    const current = await prisma.rulesetEntry.findUnique({ where: { entryId: req.params.entryId } });
    if (!current) throw new ApiError(404, "entry not found");
    if (!(await assertIfMatch(req, res, getRulesetEntryEtag(current), { entryId: current.entryId, enabled: current.enabled, orderPriority: current.orderPriority }))) return;

    const entry = await patchRulesetEntry(prisma, req.params.entryId, { enabled: req.body.enabled, orderPriority: req.body.orderPriority });
    res.setHeader("ETag", getRulesetEntryEtag(entry));
    res.json(entry);
  } catch (error) {
    handleError(res, error);
  }
});

app.delete("/v1/ruleset-entries/:entryId", async (req, res) => {
  try {
    const current = await prisma.rulesetEntry.findUnique({ where: { entryId: req.params.entryId } });
    if (!current) throw new ApiError(404, "entry not found");
    if (!(await assertIfMatch(req, res, getRulesetEntryEtag(current), { entryId: current.entryId, enabled: current.enabled, orderPriority: current.orderPriority }))) return;
    await deleteRulesetEntry(prisma, req.params.entryId);
    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
});

app.get("/v1/ruleset-table", async (req, res) => {
  try {
    const data = await getRulesetTable(prisma, {
      q: req.query.q as string | undefined,
      status: req.query["filters[status]"] as any,
      executionMode: req.query["filters[executionMode]"] as any,
      sort: req.query.sort as string | undefined,
      size: req.query["page[size]"] ? Number(req.query["page[size]"]) : undefined,
      cursor: req.query["page[cursor]"] as string | undefined
    });
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
});

app.get("/v1/ruleset-table/:rulesetVersionId/entries", async (req, res) => {
  try {
    const data = await getRulesetTableEntries(prisma, req.params.rulesetVersionId, {
      sort: req.query.sort as string | undefined,
      size: req.query["page[size]"] ? Number(req.query["page[size]"]) : undefined,
      cursor: req.query["page[cursor]"] as string | undefined
    });
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
});

function handleError(res: express.Response, error: unknown) {
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({ error: error.message, ...(error.details ? { details: error.details } : {}) });
    return;
  }
  const message = error instanceof Error ? error.message : "unknown error";
  res.status(400).json({ error: message });
}

app.listen(env.BACKEND_PORT, () => console.log(`Backend listening on port ${env.BACKEND_PORT}`));
