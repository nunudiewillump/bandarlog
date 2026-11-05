-- Removing a person may leave a task unassigned. API creation/edit validation
-- still requires explicit responsible people; remaining assignees must be members.
CREATE OR REPLACE FUNCTION validate_task_responsibility() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text; cid text; removed timestamptz; task_state text;
BEGIN
  IF TG_TABLE_NAME='tasks' THEN target:=NEW.id;
  ELSIF TG_OP='DELETE' THEN target:=OLD.task_id;
  ELSE target:=NEW.task_id; END IF;
  SELECT commission_id,deleted_at,status INTO cid,removed,task_state FROM tasks WHERE id=target;
  IF cid IS NULL OR removed IS NOT NULL OR EXISTS (SELECT 1 FROM commissions WHERE id=cid AND deleted_at IS NOT NULL) THEN RETURN NULL; END IF;
  IF task_state <> 'done' AND EXISTS (SELECT 1 FROM assignments a WHERE a.task_id=target AND NOT EXISTS (SELECT 1 FROM members m WHERE m.commission_id=cid AND m.user_id=a.user_id)) THEN
    RAISE EXCEPTION 'Los responsables deben pertenecer a la comisión' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$;
