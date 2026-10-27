ALTER TABLE tasks ADD CONSTRAINT task_status CHECK (status IN ('pending','in_progress','blocked','done'));
--> statement-breakpoint
ALTER TABLE tasks ADD CONSTRAINT task_block_reason CHECK (status <> 'blocked' OR length(trim(blocked_reason)) > 0);
--> statement-breakpoint
ALTER TABLE tasks ADD CONSTRAINT task_completion CHECK ((status = 'done' AND completed_by IS NOT NULL AND completed_at IS NOT NULL) OR (status <> 'done' AND completed_by IS NULL AND completed_at IS NULL));
--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT user_role CHECK (role IN ('admin','coordination','member'));
--> statement-breakpoint
ALTER TABLE members ADD CONSTRAINT member_role CHECK (role IN ('coordinator','member'));
--> statement-breakpoint
ALTER TABLE projects ADD CONSTRAINT project_type CHECK (type IN ('ronda','camp'));
--> statement-breakpoint
ALTER TABLE projects ADD CONSTRAINT project_parent FOREIGN KEY (parent_id) REFERENCES projects(id);
--> statement-breakpoint
CREATE UNIQUE INDEX invitation_pending ON invitations(commission_id, lower(email)) WHERE status='pending';
--> statement-breakpoint
CREATE FUNCTION validate_task_responsibility() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text; cid text;
BEGIN
  IF TG_TABLE_NAME='tasks' THEN target:=NEW.id;
  ELSIF TG_OP='DELETE' THEN target:=OLD.task_id;
  ELSE target:=NEW.task_id; END IF;
  SELECT commission_id INTO cid FROM tasks WHERE id=target;
  IF cid IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM assignments WHERE task_id=target) THEN
    RAISE EXCEPTION 'Una tarea debe tener al menos un responsable' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM assignments a WHERE a.task_id=target AND NOT EXISTS (SELECT 1 FROM members m WHERE m.commission_id=cid AND m.user_id=a.user_id)) THEN
    RAISE EXCEPTION 'Los responsables deben pertenecer a la comisión' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER task_responsibility AFTER INSERT OR UPDATE ON tasks DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_task_responsibility();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER assignment_responsibility AFTER INSERT OR UPDATE OR DELETE ON assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_task_responsibility();
--> statement-breakpoint
CREATE FUNCTION validate_member_removal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM assignments a JOIN tasks t ON t.id=a.task_id WHERE a.user_id=OLD.user_id AND t.commission_id=OLD.commission_id AND NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id=OLD.user_id AND m.commission_id=OLD.commission_id)) THEN
    RAISE EXCEPTION 'Reasigna las tareas antes de quitar al miembro' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER member_responsibility AFTER DELETE OR UPDATE ON members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_member_removal();
