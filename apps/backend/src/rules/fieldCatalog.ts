export type FieldType = "NUMBER" | "STRING" | "BOOLEAN" | "DATETIME" | "ENUM" | "LIST";

export type RuleOperator =
  | "EQ"
  | "NEQ"
  | "GT"
  | "GTE"
  | "LT"
  | "LTE"
  | "IN"
  | "NOT_IN"
  | "BETWEEN"
  | "NOT_BETWEEN"
  | "IS_NULL"
  | "IS_NOT_NULL"
  | "IS_EMPTY"
  | "CONTAINS"
  | "NOT_CONTAINS"
  | "STARTS_WITH"
  | "ENDS_WITH"
  | "MATCHES_REGEX"
  | "MEMBER_OF"
  | "NOT_MEMBER_OF";

export interface FieldDefinition {
  fieldKey: string;
  label: string;
  type: FieldType;
}

export const OPERATOR_BY_FIELD_TYPE: Record<FieldType, RuleOperator[]> = {
  NUMBER: ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "IN", "NOT_IN", "BETWEEN", "NOT_BETWEEN", "IS_NULL", "IS_NOT_NULL"],
  DATETIME: ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "BETWEEN", "NOT_BETWEEN", "IS_NULL", "IS_NOT_NULL"],
  STRING: [
    "EQ",
    "NEQ",
    "IN",
    "NOT_IN",
    "IS_NULL",
    "IS_NOT_NULL",
    "IS_EMPTY",
    "CONTAINS",
    "NOT_CONTAINS",
    "STARTS_WITH",
    "ENDS_WITH",
    "MATCHES_REGEX"
  ],
  BOOLEAN: ["EQ", "NEQ", "IS_NULL", "IS_NOT_NULL"],
  ENUM: ["EQ", "NEQ", "IN", "NOT_IN", "IS_NULL", "IS_NOT_NULL"],
  LIST: ["IS_EMPTY", "CONTAINS", "NOT_CONTAINS", "MEMBER_OF", "NOT_MEMBER_OF", "IS_NULL", "IS_NOT_NULL"]
};

export class FieldCatalog {
  private readonly fields = new Map<string, FieldDefinition>();

  constructor(definitions: FieldDefinition[]) {
    for (const definition of definitions) {
      this.fields.set(definition.fieldKey, definition);
    }
  }

  get(fieldKey: string): FieldDefinition | undefined {
    return this.fields.get(fieldKey);
  }

  require(fieldKey: string): FieldDefinition {
    const field = this.get(fieldKey);
    if (!field) {
      throw new Error(`Unknown field key: ${fieldKey}`);
    }
    return field;
  }

  isOperatorAllowed(fieldKey: string, operator: RuleOperator): boolean {
    const field = this.require(fieldKey);
    return OPERATOR_BY_FIELD_TYPE[field.type].includes(operator);
  }
}

export const DEFAULT_FIELD_CATALOG = new FieldCatalog([
  { fieldKey: "txn.amount", label: "Transaction Amount", type: "NUMBER" },
  { fieldKey: "txn.mcc", label: "Merchant Category", type: "ENUM" },
  { fieldKey: "card.present", label: "Card Present", type: "BOOLEAN" },
  { fieldKey: "txn.timestamp", label: "Transaction Timestamp", type: "DATETIME" },
  { fieldKey: "account.tags", label: "Account Tags", type: "LIST" },
  { fieldKey: "txn.country", label: "Transaction Country", type: "STRING" }
]);
