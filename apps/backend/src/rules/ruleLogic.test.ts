import assert from "node:assert/strict";
import { validateRuleAst } from "./ast.js";
import { FieldCatalog } from "./fieldCatalog.js";
import { generateTemplateDescription } from "./description.js";

const catalog = new FieldCatalog([
  { fieldKey: "txn.amount", label: "Amount", type: "NUMBER" },
  { fieldKey: "txn.mcc", label: "MCC", type: "ENUM" },
  { fieldKey: "card.present", label: "Card Present", type: "BOOLEAN" },
  { fieldKey: "txn.country", label: "Country", type: "STRING" }
]);

const validAst = {
  nodeType: "AND",
  children: [
    { nodeType: "CONDITION", operator: "GT", fieldKey: "txn.amount", value: 100 },
    { nodeType: "CONDITION", operator: "IN", fieldKey: "txn.mcc", value: ["4814", "7995"] },
    { nodeType: "NOT", child: { nodeType: "CONDITION", operator: "EQ", fieldKey: "card.present", value: true } }
  ]
} as const;

const parsed = validateRuleAst(validAst, catalog);
assert.equal(parsed.nodeType, "AND");

assert.throws(
  () => validateRuleAst({ nodeType: "CONDITION", operator: "MATCHES_REGEX", fieldKey: "txn.amount", value: "^1" }, catalog),
  /not allowed/
);

assert.throws(
  () => validateRuleAst({ nodeType: "CONDITION", operator: "BETWEEN", fieldKey: "txn.amount", value: [100] }, catalog),
  /two-item range/
);

const firstDescription = generateTemplateDescription(parsed, { action: "BLOCK" });
const secondDescription = generateTemplateDescription(parsed, { action: "BLOCK" });
assert.equal(firstDescription, "BLOCK if txn.amount > 100 AND txn.mcc IN {4814,7995} AND NOT card.present = true");
assert.equal(firstDescription, secondDescription);

console.log("ruleLogic.test.ts: all assertions passed");
