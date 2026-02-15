import fs from "node:fs";

const env = {
  NPM_REGISTRY_URL: process.env.NPM_REGISTRY_URL,
  NPM_REGISTRY_HOST: process.env.NPM_REGISTRY_HOST,
  NPM_TOKEN: process.env.NPM_TOKEN
};

const problems = [];

if (!env.NPM_REGISTRY_URL) {
  problems.push("NPM_REGISTRY_URL is missing.");
} else if (!/^https?:\/\//.test(env.NPM_REGISTRY_URL)) {
  problems.push("NPM_REGISTRY_URL must start with http:// or https://.");
}

if (!env.NPM_REGISTRY_HOST) {
  problems.push("NPM_REGISTRY_HOST is missing (host/path without protocol).");
} else if (/^https?:\/\//.test(env.NPM_REGISTRY_HOST)) {
  problems.push("NPM_REGISTRY_HOST must not include protocol (expected host/path only).");
}

if (!fs.existsSync(".npmrc")) {
  problems.push(".npmrc is missing. Run npm run setup:npmrc or copy from .npmrc.example first.");
} else {
  const npmrc = fs.readFileSync(".npmrc", "utf8");
  if (npmrc.includes("${")) {
    problems.push(".npmrc still has unresolved ${...} placeholders. Fill concrete values first.");
  }
}

if (problems.length > 0) {
  console.error("npm registry preflight failed:\n- " + problems.join("\n- "));
  process.exit(1);
}

console.log("npm registry preflight OK.");
