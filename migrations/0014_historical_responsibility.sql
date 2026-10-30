-- Historical assignments survive account and commission removal. Live tasks must
-- still have a responsible member; reopening a completed task checks this again.
CREATE OR REPLACE FUNCTION validate_task_responsibility() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text; cid text; removed timestamptz; task_state text;
BEGIN
  IF TG_TABLE_NAME='tasks' THEN target:=NEW.id;
  ELSIF TG_OP='DELETE' THEN target:=OLD.task_id;
  ELSE target:=NEW.task_id; END IF;
  SELECT commission_id,deleted_at,status INTO cid,removed,task_state FROM tasks WHERE id=target;
  IF cid IS NULL OR removed IS NOT NULL OR EXISTS (SELECT 1 FROM commissions WHERE id=cid AND deleted_at IS NOT NULL) THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM assignments WHERE task_id=target) THEN
    RAISE EXCEPTION 'Una tarea debe tener al menos un responsable' USING ERRCODE='23514';
  END IF;
  IF task_state <> 'done' AND EXISTS (SELECT 1 FROM assignments a WHERE a.task_id=target AND NOT EXISTS (SELECT 1 FROM members m WHERE m.commission_id=cid AND m.user_id=a.user_id)) THEN
    RAISE EXCEPTION 'Los responsables deben pertenecer a la comisión' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_member_removal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM assignments a
    JOIN tasks t ON t.id=a.task_id
    JOIN commissions c ON c.id=t.commission_id
    WHERE t.deleted_at IS NULL AND c.deleted_at IS NULL AND t.status <> 'done'
      AND a.user_id=OLD.user_id AND t.commission_id=OLD.commission_id
      AND NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id=OLD.user_id AND m.commission_id=OLD.commission_id)
  ) THEN
    RAISE EXCEPTION 'Reasigna las tareas antes de quitar al miembro' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$;
