import express from "express";
import { env } from "./config.js";
import { attachDemoUser } from "./auth/demoAuth.js";

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

app.listen(env.BACKEND_PORT, () => {
  console.log(`Backend listening on port ${env.BACKEND_PORT}`);
});
