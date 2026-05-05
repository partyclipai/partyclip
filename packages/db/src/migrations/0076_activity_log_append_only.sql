-- Enforce append-only on activity_log at the database layer.
-- The application treats activity_log as the audit/event store; UPDATE and
-- DELETE are not legitimate operations from any code path. This trigger
-- catches accidents (and operator mistakes via psql) by raising an error.
-- See docs/handoff/02_ARCHITECTURE.md ("the log is the truth; the database is a cache").

CREATE OR REPLACE FUNCTION activity_log_block_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'activity_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_log_no_update ON activity_log;--> statement-breakpoint
CREATE TRIGGER activity_log_no_update
BEFORE UPDATE ON activity_log
FOR EACH ROW EXECUTE FUNCTION activity_log_block_mutation();--> statement-breakpoint
DROP TRIGGER IF EXISTS activity_log_no_delete ON activity_log;--> statement-breakpoint
CREATE TRIGGER activity_log_no_delete
BEFORE DELETE ON activity_log
FOR EACH ROW EXECUTE FUNCTION activity_log_block_mutation();
