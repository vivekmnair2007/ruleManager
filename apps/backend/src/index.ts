import express from "express";
import { env } from "./config.js";
import { attachDemoUser } from "./auth/demoAuth.js";
import { prisma } from "./db.js";
import { saveDraftRuleVersion } from "./rules/service.js";
import {
  addRulesetEntry,
  ApiError,
  approveRulesetVersion,
  activateRulesetVersion,
  createRulesetVersion,
  createRulesetWithDraft,
  deleteRulesetEntry,
  getRulesetDetail,
  listRulesets,
  patchRulesetEntry,
  rollbackActivateRulesetVersion,
  updateRulesetVersionSettings
} from "./rulesets/service.js";

const app = express();
app.use(express.json());
app.use(attachDemoUser);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/me", (req, res) => {
  const user = (req as typeof req & { user?: unknown }).user;
  res.json({ user });
});

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
    res.status(201).json({ ruleVersionId: draft.ruleVersionId, description: draft.description, descriptionSource: draft.descriptionSource });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    res.status(400).json({ error: message });
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
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error);
  }
});

app.get("/v1/rulesets", async (_req, res) => {
  try {
    const rulesets = await listRulesets(prisma);
    res.json({ items: rulesets });
  } catch (error) {
    handleError(res, error);
  }
});

app.get("/v1/rulesets/:rulesetId", async (req, res) => {
  try {
    const detail = await getRulesetDetail(prisma, req.params.rulesetId);
    res.json(detail);
  } catch (error) {
    handleError(res, error);
  }
});

app.post("/v1/rulesets/:rulesetId/versions", async (req, res) => {
  try {
    const user = (req as typeof req & { user?: { email?: string } }).user;
    const version = await createRulesetVersion(prisma, req.params.rulesetId, user?.email ?? "unknown");
    res.status(201).json(version);
  } catch (error) {
    handleError(res, error);
  }
});

app.patch("/v1/ruleset-versions/:rulesetVersionId", async (req, res) => {
  try {
    const version = await updateRulesetVersionSettings(prisma, req.params.rulesetVersionId, {
      executionMode: req.body.executionMode,
      decisionPrecedence: req.body.decisionPrecedence
    });
    res.json(version);
  } catch (error) {
    handleError(res, error);
  }
});

app.post(/^\/v1\/ruleset-versions\/([^/]+):approve$/, async (req, res) => {
  try {
    const user = (req as typeof req & { user?: { email?: string } }).user;
    const rulesetVersionId = req.params[0];
    const version = await approveRulesetVersion(prisma, rulesetVersionId, user?.email ?? "unknown");
    res.json(version);
  } catch (error) {
    handleError(res, error);
  }
});

app.post(/^\/v1\/ruleset-versions\/([^/]+):activate$/, async (req, res) => {
  try {
    const user = (req as typeof req & { user?: { email?: string } }).user;
    const rulesetVersionId = req.params[0];
    const version = await activateRulesetVersion(prisma, rulesetVersionId, user?.email ?? "unknown");
    res.json(version);
  } catch (error) {
    handleError(res, error);
  }
});

app.post(/^\/v1\/rulesets\/([^/]+):activateVersion$/, async (req, res) => {
  try {
    const user = (req as typeof req & { user?: { email?: string } }).user;
    const rulesetId = req.params[0];
    const version = await rollbackActivateRulesetVersion(
      prisma,
      rulesetId,
      req.body.rulesetVersionId,
      user?.email ?? "unknown"
    );
    res.json(version);
  } catch (error) {
    handleError(res, error);
  }
});

app.post("/v1/ruleset-versions/:rulesetVersionId/entries", async (req, res) => {
  try {
    const entry = await addRulesetEntry(prisma, req.params.rulesetVersionId, {
      ruleVersionId: req.body.ruleVersionId,
      enabled: req.body.enabled,
      orderPriority: req.body.orderPriority
    });
    res.status(201).json(entry);
  } catch (error) {
    handleError(res, error);
  }
});

app.patch("/v1/ruleset-entries/:entryId", async (req, res) => {
  try {
    const entry = await patchRulesetEntry(prisma, req.params.entryId, {
      enabled: req.body.enabled,
      orderPriority: req.body.orderPriority
    });
    res.json(entry);
  } catch (error) {
    handleError(res, error);
  }
});

app.delete("/v1/ruleset-entries/:entryId", async (req, res) => {
  try {
    await deleteRulesetEntry(prisma, req.params.entryId);
    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
});

function handleError(res: express.Response, error: unknown) {
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  const message = error instanceof Error ? error.message : "unknown error";
  res.status(400).json({ error: message });
}

app.listen(env.BACKEND_PORT, () => {
  console.log(`Backend listening on port ${env.BACKEND_PORT}`);
});
