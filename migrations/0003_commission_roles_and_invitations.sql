ALTER TABLE members DROP CONSTRAINT member_role;
--> statement-breakpoint
UPDATE members SET role=CASE role WHEN 'coordinator' THEN 'responsible' WHEN 'member' THEN 'scouter' ELSE role END;
--> statement-breakpoint
SET CONSTRAINTS ALL IMMEDIATE;
--> statement-breakpoint
ALTER TABLE members ADD CONSTRAINT member_role CHECK (role IN ('scouter','responsible'));
--> statement-breakpoint
ALTER TABLE invitations ADD CONSTRAINT invitation_role CHECK (role IN ('scouter','responsible'));
--> statement-breakpoint
CREATE UNIQUE INDEX invitation_group_pending ON invitations(lower(email)) WHERE status='pending' AND commission_id IS NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_task_responsibility() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text; cid text; removed timestamptz;
BEGIN
  IF TG_TABLE_NAME='tasks' THEN target:=NEW.id;
  ELSIF TG_OP='DELETE' THEN target:=OLD.task_id;
  ELSE target:=NEW.task_id; END IF;
  SELECT commission_id,deleted_at INTO cid,removed FROM tasks WHERE id=target;
  IF cid IS NULL OR removed IS NOT NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM assignments WHERE task_id=target) THEN
    RAISE EXCEPTION 'Una tarea debe tener al menos un responsable' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM assignments a WHERE a.task_id=target AND NOT EXISTS (SELECT 1 FROM members m WHERE m.commission_id=cid AND m.user_id=a.user_id)) THEN
    RAISE EXCEPTION 'Los responsables deben pertenecer a la comisión' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_member_removal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM assignments a JOIN tasks t ON t.id=a.task_id WHERE t.deleted_at IS NULL AND a.user_id=OLD.user_id AND t.commission_id=OLD.commission_id AND NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id=OLD.user_id AND m.commission_id=OLD.commission_id)) THEN
    RAISE EXCEPTION 'Reasigna las tareas antes de quitar al miembro' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END; $$;

--> statement-breakpoint
SET CONSTRAINTS ALL DEFERRED;
