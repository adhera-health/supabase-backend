-- Append-only audit log for critical invitation and onboarding actions.

CREATE TABLE audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  action          TEXT NOT NULL,
  actor_user_id   UUID,
  actor_ip          TEXT,
  metadata_json   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_logs IS
  'Immutable audit trail for critical actions. Insert-only from application code.';

CREATE INDEX idx_audit_logs_entity
  ON audit_logs (entity_type, entity_id);

CREATE INDEX idx_audit_logs_action_created
  ON audit_logs (action, created_at DESC);

CREATE INDEX idx_audit_logs_actor_created
  ON audit_logs (actor_user_id, created_at DESC);
