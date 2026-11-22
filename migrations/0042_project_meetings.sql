CREATE TABLE public.project_decisions (
  id text PRIMARY KEY,
  group_id text NOT NULL DEFAULT nullif(current_setting('bandarlog.group_id', true), ''),
  project_id text NOT NULL,
  commission_id text,
  owner_id text,
  author_id text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  target date,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  revision integer NOT NULL DEFAULT 1,
  CHECK ((resolution IS NULL) = (resolved_at IS NULL)),
  UNIQUE (group_id, project_id, id),
  FOREIGN KEY (group_id, project_id) REFERENCES public.projects(group_id, id),
  FOREIGN KEY (group_id, project_id, commission_id) REFERENCES public.commissions(group_id, project_id, id),
  FOREIGN KEY (group_id, owner_id) REFERENCES public.users(group_id, id),
  FOREIGN KEY (group_id, author_id) REFERENCES public.users(group_id, id)
);
--> statement-breakpoint
CREATE INDEX project_decisions_scope ON public.project_decisions(group_id, project_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE public.project_minutes (
  id text PRIMARY KEY,
  group_id text NOT NULL DEFAULT nullif(current_setting('bandarlog.group_id', true), ''),
  project_id text NOT NULL,
  author_id text NOT NULL,
  held_on date NOT NULL,
  title text NOT NULL,
  agenda text NOT NULL,
  notes text NOT NULL,
  decision_ids jsonb NOT NULL DEFAULT '[]',
  task_ids jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_references jsonb,
  revision integer NOT NULL DEFAULT 1,
  FOREIGN KEY (group_id, project_id) REFERENCES public.projects(group_id, id),
  FOREIGN KEY (group_id, author_id) REFERENCES public.users(group_id, id)
);
--> statement-breakpoint
CREATE INDEX project_minutes_scope ON public.project_minutes(group_id, project_id, held_on DESC);
--> statement-breakpoint
CREATE TABLE public.project_followups (
  group_id text NOT NULL DEFAULT nullif(current_setting('bandarlog.group_id', true), ''),
  project_id text NOT NULL,
  decision_id text NOT NULL,
  task_id text PRIMARY KEY,
  FOREIGN KEY (group_id, project_id, decision_id) REFERENCES public.project_decisions(group_id, project_id, id),
  FOREIGN KEY (group_id, task_id) REFERENCES public.tasks(group_id, id)
);
--> statement-breakpoint
CREATE INDEX project_followups_scope ON public.project_followups(group_id, project_id, decision_id);
--> statement-breakpoint
DO $$
DECLARE relation text; visibility text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['project_decisions','project_minutes','project_followups'] LOOP
    visibility := CASE relation
      WHEN 'project_decisions' THEN '(commission_id IS NULL OR bandarlog_api.actor_commission(commission_id,false))'
      WHEN 'project_followups' THEN '(EXISTS(SELECT FROM public.tasks t WHERE t.group_id=project_followups.group_id AND t.id=task_id AND t.deleted_at IS NULL) AND EXISTS(SELECT FROM public.project_decisions d WHERE d.id=decision_id AND d.group_id=project_followups.group_id))'
      ELSE 'bandarlog_api.actor_manages()'
    END;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO bandarlog_group_app,bandarlog_user_app', relation);
    EXECUTE format('CREATE POLICY group_isolation ON public.%I TO bandarlog_group_app USING(group_id=(SELECT bandarlog_api.current_group())) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()))', relation);
    EXECUTE format('CREATE POLICY actor_read ON public.%I FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND bandarlog_api.actor_project(project_id) AND %s)', relation, visibility);
    EXECUTE format('CREATE POLICY actor_insert ON public.%I FOR INSERT TO bandarlog_user_app WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND bandarlog_api.actor_project(project_id) AND bandarlog_api.actor_manages())', relation);
    EXECUTE format('CREATE POLICY actor_update ON public.%I FOR UPDATE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND bandarlog_api.actor_project(project_id) AND bandarlog_api.actor_manages()) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND bandarlog_api.actor_project(project_id) AND bandarlog_api.actor_manages())', relation);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.preserve_closed_project_minutes() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Minutes already closed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER preserve_closed_project_minutes BEFORE UPDATE ON public.project_minutes FOR EACH ROW EXECUTE FUNCTION bandarlog_api.preserve_closed_project_minutes();
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.check_project_followup() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NOT bandarlog_api.project_task_reference(NEW.group_id, NEW.project_id, NEW.task_id) THEN
    RAISE EXCEPTION 'Follow-up task must belong to the project' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER check_project_followup BEFORE INSERT OR UPDATE ON public.project_followups FOR EACH ROW EXECUTE FUNCTION bandarlog_api.check_project_followup();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 42 $$;
