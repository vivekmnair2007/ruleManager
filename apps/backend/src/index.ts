import express from "express";
import { env } from "./config.js";
import { attachDemoUser } from "./auth/demoAuth.js";
import { prisma } from "./db.js";
import { saveDraftRuleVersion } from "./rules/service.js";

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

app.listen(env.BACKEND_PORT, () => {
  console.log(`Backend listening on port ${env.BACKEND_PORT}`);
});
