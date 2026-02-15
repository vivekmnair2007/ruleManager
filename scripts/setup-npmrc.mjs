import fs from "node:fs";
import path from "node:path";

const env = {
  NPM_REGISTRY_URL: process.env.NPM_REGISTRY_URL,
  NPM_REGISTRY_HOST: process.env.NPM_REGISTRY_HOST,
  NPM_TOKEN: process.env.NPM_TOKEN ?? ""
};

const missing = [];
if (!env.NPM_REGISTRY_URL) missing.push("NPM_REGISTRY_URL");
if (!env.NPM_REGISTRY_HOST) missing.push("NPM_REGISTRY_HOST");

if (missing.length > 0) {
  console.error(`Missing required env var(s): ${missing.join(", ")}`);
  process.exit(1);
}

const npmrc = [
  `registry=${env.NPM_REGISTRY_URL}`,
  "strict-ssl=true",
  `//${env.NPM_REGISTRY_HOST}:_authToken=${env.NPM_TOKEN}`,
  `@prisma:registry=${env.NPM_REGISTRY_URL}`,
  ""
].join("\n");

const target = path.resolve(process.cwd(), ".npmrc");
fs.writeFileSync(target, npmrc, "utf8");
console.log(`Wrote ${target}`);
