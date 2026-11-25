CREATE TABLE public.evaluation_templates (
  group_id text NOT NULL DEFAULT nullif(current_setting('bandarlog.group_id', true), '') REFERENCES public.scout_groups(id),
  id text NOT NULL,
  structure jsonb NOT NULL CHECK (jsonb_typeof(structure) = 'object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  archived boolean NOT NULL DEFAULT false,
  PRIMARY KEY (group_id, id)
);
--> statement-breakpoint
CREATE TABLE public.evaluation_template_versions (
  group_id text NOT NULL DEFAULT nullif(current_setting('bandarlog.group_id', true), ''),
  template_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  structure jsonb NOT NULL CHECK (jsonb_typeof(structure) = 'object'),
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by text NOT NULL,
  PRIMARY KEY (group_id, template_id, revision),
  FOREIGN KEY (group_id, template_id) REFERENCES public.evaluation_templates(group_id, id),
  FOREIGN KEY (group_id, published_by) REFERENCES public.users(group_id, id)
);
--> statement-breakpoint
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['evaluation_templates','evaluation_template_versions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('GRANT SELECT ON public.%I TO bandarlog_group_app,bandarlog_user_app', relation);
    EXECUTE format('CREATE POLICY group_scope ON public.%I TO bandarlog_group_app USING(group_id=(SELECT bandarlog_api.current_group())) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()))', relation);
    EXECUTE format('CREATE POLICY manager_read ON public.%I FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (SELECT bandarlog_api.actor_manages()))', relation);
  END LOOP;
END $$;
--> statement-breakpoint
GRANT INSERT ON public.evaluation_templates, public.evaluation_template_versions TO bandarlog_user_app, bandarlog_group_app;
--> statement-breakpoint
GRANT UPDATE (structure, revision, archived) ON public.evaluation_templates TO bandarlog_user_app, bandarlog_group_app;
--> statement-breakpoint
CREATE POLICY manager_create ON public.evaluation_templates FOR INSERT TO bandarlog_user_app WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (SELECT bandarlog_api.actor_manages()));
--> statement-breakpoint
CREATE POLICY manager_edit ON public.evaluation_templates FOR UPDATE TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND (SELECT bandarlog_api.actor_manages())) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND (SELECT bandarlog_api.actor_manages()));
--> statement-breakpoint
CREATE POLICY manager_publish ON public.evaluation_template_versions FOR INSERT TO bandarlog_user_app WITH CHECK (
  group_id=(SELECT bandarlog_api.current_group()) AND (SELECT bandarlog_api.actor_manages())
  AND published_by=(SELECT bandarlog_api.actor_id())
);
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.check_evaluation_template_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM public.evaluation_templates t
    WHERE (t.group_id, t.id) = (NEW.group_id, NEW.template_id)
      AND t.revision = NEW.revision AND t.structure = NEW.structure AND NOT t.archived
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Template snapshot does not match its active draft' USING ERRCODE='23514';
  END IF;
  NEW.published_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.check_evaluation_template_snapshot() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER check_evaluation_template_snapshot BEFORE INSERT ON public.evaluation_template_versions
FOR EACH ROW EXECUTE FUNCTION bandarlog_api.check_evaluation_template_snapshot();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 43 $$;
