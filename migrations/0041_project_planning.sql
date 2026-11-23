CREATE TABLE public.project_phases (
  id text PRIMARY KEY,
  group_id text NOT NULL DEFAULT nullif(current_setting('bandarlog.group_id', true), ''),
  project_id text NOT NULL,
  name text NOT NULL,
  "starts" date NOT NULL,
  "ends" date NOT NULL CHECK ("ends" >= "starts"),
  position integer NOT NULL,
  description text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1,
  FOREIGN KEY (group_id, project_id) REFERENCES public.projects(group_id, id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS commission_project_reference ON public.commissions(group_id, project_id, id);
--> statement-breakpoint
CREATE TABLE public.project_milestones (
  id text PRIMARY KEY,
  group_id text NOT NULL DEFAULT nullif(current_setting('bandarlog.group_id', true), ''),
  project_id text NOT NULL,
  commission_id text,
  name text NOT NULL,
  planned date NOT NULL,
  achieved date,
  description text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1,
  FOREIGN KEY (group_id, project_id) REFERENCES public.projects(group_id, id),
  FOREIGN KEY (group_id, project_id, commission_id) REFERENCES public.commissions(group_id, project_id, id)
);
--> statement-breakpoint
CREATE TABLE public.project_dependencies (
  group_id text NOT NULL DEFAULT nullif(current_setting('bandarlog.group_id', true), ''),
  project_id text NOT NULL,
  source_id text NOT NULL,
  target_id text NOT NULL CHECK (source_id <> target_id),
  PRIMARY KEY (group_id, project_id, source_id, target_id),
  FOREIGN KEY (group_id, project_id) REFERENCES public.projects(group_id, id),
  FOREIGN KEY (group_id, source_id) REFERENCES public.tasks(group_id, id),
  FOREIGN KEY (group_id, target_id) REFERENCES public.tasks(group_id, id)
);
--> statement-breakpoint
CREATE INDEX project_phases_scope ON public.project_phases(group_id, project_id, position);
--> statement-breakpoint
CREATE INDEX project_milestones_scope ON public.project_milestones(group_id, project_id, planned);
--> statement-breakpoint
DO $$
DECLARE relation text; visibility text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['project_phases','project_milestones','project_dependencies'] LOOP
    visibility := CASE relation
      WHEN 'project_milestones' THEN '(commission_id IS NULL OR bandarlog_api.actor_commission(commission_id,false))'
      WHEN 'project_dependencies' THEN '(EXISTS(SELECT FROM public.tasks t WHERE t.group_id=project_dependencies.group_id AND t.id=source_id AND t.deleted_at IS NULL) AND EXISTS(SELECT FROM public.tasks t WHERE t.group_id=project_dependencies.group_id AND t.id=target_id AND t.deleted_at IS NULL))'
      ELSE 'true'
    END;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO bandarlog_group_app,bandarlog_user_app', relation);
    EXECUTE format('CREATE POLICY group_isolation ON public.%I TO bandarlog_group_app USING(group_id=(SELECT bandarlog_api.current_group())) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()))', relation);
    EXECUTE format('CREATE POLICY actor_read ON public.%I FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND bandarlog_api.actor_project(project_id) AND %s)', relation, visibility);
    EXECUTE format('CREATE POLICY actor_write ON public.%I TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND bandarlog_api.actor_project(project_id) AND bandarlog_api.actor_manages()) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND bandarlog_api.actor_project(project_id) AND bandarlog_api.actor_manages())', relation);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.project_task_reference(p_group text, p_project text, p_task text) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT FROM public.tasks t JOIN public.commissions c ON (c.group_id,c.id)=(t.group_id,t.commission_id)
    WHERE t.group_id=p_group AND c.project_id=p_project AND t.id=p_task
    AND t.deleted_at IS NULL AND c.deleted_at IS NULL)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.project_task_reference(text,text,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.project_task_reference(text,text,text) TO bandarlog_user_app,bandarlog_group_app;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.check_project_dependency() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NOT (bandarlog_api.project_task_reference(NEW.group_id, NEW.project_id, NEW.source_id) AND
          bandarlog_api.project_task_reference(NEW.group_id, NEW.project_id, NEW.target_id)) THEN
    RAISE EXCEPTION 'Dependency tasks must belong to the project' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER check_project_dependency BEFORE INSERT OR UPDATE ON public.project_dependencies FOR EACH ROW EXECUTE FUNCTION bandarlog_api.check_project_dependency();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 41 $$;
