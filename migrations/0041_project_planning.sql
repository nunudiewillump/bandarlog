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
      WHEN 'project_dependencies' THEN '(bandarlog_api.actor_task(source_id) AND bandarlog_api.actor_task(target_id))'
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
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 41 $$;
