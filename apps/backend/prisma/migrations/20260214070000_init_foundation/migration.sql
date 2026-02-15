CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE rule_type AS ENUM ('FRAUD', 'BUSINESS');
CREATE TYPE rule_version_status AS ENUM ('DRAFT', 'APPROVED');
CREATE TYPE ruleset_version_status AS ENUM ('DRAFT', 'APPROVED', 'ACTIVE');
CREATE TYPE execution_mode AS ENUM ('SEQUENTIAL', 'PARALLEL');
CREATE TYPE description_source AS ENUM ('MANUAL', 'TEMPLATE', 'GENAI');

CREATE TABLE rule (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  type rule_type NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  archived_at TIMESTAMPTZ NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_rule_type ON rule(type);
CREATE INDEX ix_rule_archived_at ON rule(archived_at);

CREATE TABLE rule_version (
  rule_version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES rule(rule_id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL,
  status rule_version_status NOT NULL DEFAULT 'DRAFT',
  logic_ast JSONB NOT NULL,
  decision JSONB NOT NULL,
  description TEXT NULL,
  description_source description_source NOT NULL DEFAULT 'TEMPLATE',
  description_generated_at TIMESTAMPTZ NULL,
  change_summary TEXT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by TEXT NULL,
  approved_at TIMESTAMPTZ NULL,
  CONSTRAINT ux_rule_version_per_rule UNIQUE (rule_id, version_number)
);

CREATE INDEX ix_rule_version_rule_status ON rule_version(rule_id, status);

CREATE TABLE ruleset (
  ruleset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_ruleset_name ON ruleset(name);

CREATE TABLE ruleset_version (
  ruleset_version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ruleset_id UUID NOT NULL REFERENCES ruleset(ruleset_id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL,
  status ruleset_version_status NOT NULL DEFAULT 'DRAFT',
  execution_mode execution_mode NOT NULL,
  decision_precedence JSONB NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by TEXT NULL,
  approved_at TIMESTAMPTZ NULL,
  activated_by TEXT NULL,
  activated_at TIMESTAMPTZ NULL,
  CONSTRAINT ux_ruleset_version_per_ruleset UNIQUE (ruleset_id, version_number),
  CONSTRAINT ck_ruleset_parallel_decision_precedence
    CHECK (execution_mode <> 'PARALLEL' OR decision_precedence IS NOT NULL)
);

CREATE INDEX ix_ruleset_version_status ON ruleset_version(ruleset_id, status);
CREATE UNIQUE INDEX ux_ruleset_single_active
  ON ruleset_version(ruleset_id)
  WHERE status = 'ACTIVE';

CREATE TABLE ruleset_entry (
  entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ruleset_version_id UUID NOT NULL REFERENCES ruleset_version(ruleset_version_id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES rule(rule_id) ON DELETE RESTRICT,
  rule_version_id UUID NOT NULL REFERENCES rule_version(rule_version_id) ON DELETE RESTRICT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  order_priority INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_ruleset_entry_ruleset_version ON ruleset_entry(ruleset_version_id);
CREATE INDEX ix_ruleset_entry_rule_version ON ruleset_entry(rule_version_id);
CREATE UNIQUE INDEX ux_ruleset_entry_sequential_order
  ON ruleset_entry(ruleset_version_id, order_priority)
  WHERE order_priority IS NOT NULL;

CREATE TABLE audit_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json JSONB NULL,
  after_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_audit_event_entity ON audit_event(entity_type, entity_id);
CREATE INDEX ix_audit_event_created_at ON audit_event(created_at);

CREATE OR REPLACE FUNCTION set_last_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rule_set_last_updated_at
BEFORE UPDATE ON rule
FOR EACH ROW
EXECUTE FUNCTION set_last_updated_at();

CREATE TRIGGER trg_ruleset_set_last_updated_at
BEFORE UPDATE ON ruleset
FOR EACH ROW
EXECUTE FUNCTION set_last_updated_at();

CREATE TRIGGER trg_ruleset_entry_set_last_updated_at
BEFORE UPDATE ON ruleset_entry
FOR EACH ROW
EXECUTE FUNCTION set_last_updated_at();

CREATE OR REPLACE FUNCTION prevent_rule_version_mutation_after_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION 'rule_version % is immutable after APPROVED', OLD.rule_version_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_rule_version_delete_after_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'APPROVED' THEN
    RAISE EXCEPTION 'rule_version % cannot be deleted after APPROVED', OLD.rule_version_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rule_version_no_update_after_approved
BEFORE UPDATE ON rule_version
FOR EACH ROW
EXECUTE FUNCTION prevent_rule_version_mutation_after_approval();

CREATE TRIGGER trg_rule_version_no_delete_after_approved
BEFORE DELETE ON rule_version
FOR EACH ROW
EXECUTE FUNCTION prevent_rule_version_delete_after_approval();

CREATE OR REPLACE FUNCTION prevent_ruleset_version_mutation_after_lock()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'APPROVED' AND NEW.status = 'ACTIVE' THEN
    IF ROW(
      OLD.ruleset_id,
      OLD.version_number,
      OLD.execution_mode,
      OLD.decision_precedence,
      OLD.created_by,
      OLD.created_at,
      OLD.approved_by,
      OLD.approved_at
    ) IS DISTINCT FROM ROW(
      NEW.ruleset_id,
      NEW.version_number,
      NEW.execution_mode,
      NEW.decision_precedence,
      NEW.created_by,
      NEW.created_at,
      NEW.approved_by,
      NEW.approved_at
    ) THEN
      RAISE EXCEPTION 'ruleset_version % can only change activation fields when transitioning APPROVED -> ACTIVE', OLD.ruleset_version_id;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'ACTIVE' AND NEW.status = 'APPROVED' THEN
    IF ROW(
      OLD.ruleset_id,
      OLD.version_number,
      OLD.execution_mode,
      OLD.decision_precedence,
      OLD.created_by,
      OLD.created_at,
      OLD.approved_by,
      OLD.approved_at
    ) IS DISTINCT FROM ROW(
      NEW.ruleset_id,
      NEW.version_number,
      NEW.execution_mode,
      NEW.decision_precedence,
      NEW.created_by,
      NEW.created_at,
      NEW.approved_by,
      NEW.approved_at
    ) THEN
      RAISE EXCEPTION 'ruleset_version % can only change activation fields when transitioning ACTIVE -> APPROVED', OLD.ruleset_version_id;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('APPROVED', 'ACTIVE') THEN
    RAISE EXCEPTION 'ruleset_version % is immutable after APPROVED/ACTIVE', OLD.ruleset_version_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_ruleset_version_delete_after_lock()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('APPROVED', 'ACTIVE') THEN
    RAISE EXCEPTION 'ruleset_version % cannot be deleted after APPROVED/ACTIVE', OLD.ruleset_version_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ruleset_version_no_update_after_lock
BEFORE UPDATE ON ruleset_version
FOR EACH ROW
EXECUTE FUNCTION prevent_ruleset_version_mutation_after_lock();

CREATE TRIGGER trg_ruleset_version_no_delete_after_lock
BEFORE DELETE ON ruleset_version
FOR EACH ROW
EXECUTE FUNCTION prevent_ruleset_version_delete_after_lock();

CREATE OR REPLACE FUNCTION validate_ruleset_entry_order_priority()
RETURNS TRIGGER AS $$
DECLARE
  v_execution_mode execution_mode;
BEGIN
  SELECT execution_mode
    INTO v_execution_mode
  FROM ruleset_version
  WHERE ruleset_version_id = NEW.ruleset_version_id;

  IF v_execution_mode = 'SEQUENTIAL' AND NEW.order_priority IS NULL THEN
    RAISE EXCEPTION 'order_priority is required when execution_mode is SEQUENTIAL';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_ruleset_entry_mutation_when_parent_locked()
RETURNS TRIGGER AS $$
DECLARE
  v_ruleset_version_id UUID;
  v_status ruleset_version_status;
BEGIN
  v_ruleset_version_id = CASE
    WHEN TG_OP = 'DELETE' THEN OLD.ruleset_version_id
    ELSE NEW.ruleset_version_id
  END;

  SELECT status
    INTO v_status
  FROM ruleset_version
  WHERE ruleset_version_id = v_ruleset_version_id;

  IF v_status IN ('APPROVED', 'ACTIVE') THEN
    RAISE EXCEPTION 'ruleset_entry cannot be % when parent ruleset_version % is %', LOWER(TG_OP), v_ruleset_version_id, v_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ruleset_entry_validate_order_priority
BEFORE INSERT OR UPDATE ON ruleset_entry
FOR EACH ROW
EXECUTE FUNCTION validate_ruleset_entry_order_priority();

CREATE TRIGGER trg_ruleset_entry_no_mutation_when_parent_locked
BEFORE INSERT OR UPDATE OR DELETE ON ruleset_entry
FOR EACH ROW
EXECUTE FUNCTION prevent_ruleset_entry_mutation_when_parent_locked();
