CREATE TABLE public.group_evaluations (
  group_id text NOT NULL DEFAULT nullif(current_setting('bandarlog.group_id', true), ''),
  id text NOT NULL,
  template_id text NOT NULL,
  template_revision integer NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  due_at timestamptz NOT NULL,
  PRIMARY KEY (group_id, id),
  FOREIGN KEY (group_id, template_id, template_revision)
    REFERENCES public.evaluation_template_versions(group_id, template_id, revision)
);
--> statement-breakpoint
CREATE TABLE public.group_evaluation_assignments (
  group_id text NOT NULL DEFAULT nullif(current_setting('bandarlog.group_id', true), ''),
  evaluation_id text NOT NULL,
  user_id text NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(answers) = 'object'),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  submitted_at timestamptz,
  PRIMARY KEY (group_id, evaluation_id, user_id),
  FOREIGN KEY (group_id, evaluation_id) REFERENCES public.group_evaluations(group_id, id),
  FOREIGN KEY (group_id, user_id) REFERENCES public.users(group_id, id)
);
--> statement-breakpoint
CREATE INDEX group_evaluation_assignee ON public.group_evaluation_assignments(group_id, user_id, evaluation_id);
--> statement-breakpoint
ALTER TABLE public.group_evaluations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.group_evaluation_assignments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.group_evaluations, public.group_evaluation_assignments TO bandarlog_user_app, bandarlog_group_app;
--> statement-breakpoint
GRANT UPDATE (answers, revision, submitted_at) ON public.group_evaluation_assignments TO bandarlog_user_app, bandarlog_group_app;
--> statement-breakpoint
CREATE POLICY group_scope ON public.group_evaluations TO bandarlog_group_app USING(group_id=(SELECT bandarlog_api.current_group()));
--> statement-breakpoint
CREATE POLICY group_scope ON public.group_evaluation_assignments TO bandarlog_group_app USING(group_id=(SELECT bandarlog_api.current_group()));
--> statement-breakpoint
CREATE POLICY evaluation_read ON public.group_evaluations FOR SELECT TO bandarlog_user_app USING (
  group_id=(SELECT bandarlog_api.current_group()) AND (
    (SELECT bandarlog_api.actor_manages()) OR EXISTS (
      SELECT FROM public.group_evaluation_assignments a
      WHERE (a.group_id,a.evaluation_id)=(group_evaluations.group_id,group_evaluations.id)
        AND a.user_id=(SELECT bandarlog_api.actor_id())
    )
  )
);
--> statement-breakpoint
CREATE POLICY evaluation_create ON public.group_evaluations FOR INSERT TO bandarlog_user_app WITH CHECK (
  group_id=(SELECT bandarlog_api.current_group()) AND (SELECT bandarlog_api.actor_manages())
);
--> statement-breakpoint
CREATE POLICY assigned_version_read ON public.evaluation_template_versions FOR SELECT TO bandarlog_user_app USING (
  group_id=(SELECT bandarlog_api.current_group()) AND EXISTS (
    SELECT FROM public.group_evaluations e
    WHERE (e.group_id,e.template_id,e.template_revision) =
      (evaluation_template_versions.group_id,evaluation_template_versions.template_id,evaluation_template_versions.revision)
  )
);
--> statement-breakpoint
CREATE POLICY assignment_read ON public.group_evaluation_assignments FOR SELECT TO bandarlog_user_app USING (
  group_id=(SELECT bandarlog_api.current_group()) AND user_id=(SELECT bandarlog_api.actor_id())
);
--> statement-breakpoint
CREATE POLICY assignment_create ON public.group_evaluation_assignments FOR INSERT TO bandarlog_user_app WITH CHECK (
  group_id=(SELECT bandarlog_api.current_group()) AND (SELECT bandarlog_api.actor_manages())
  AND revision=0 AND answers='{}'::jsonb AND submitted_at IS NULL
);
--> statement-breakpoint
CREATE POLICY assignment_update ON public.group_evaluation_assignments FOR UPDATE TO bandarlog_user_app USING (
  group_id=(SELECT bandarlog_api.current_group()) AND user_id=(SELECT bandarlog_api.actor_id()) AND submitted_at IS NULL
) WITH CHECK (
  group_id=(SELECT bandarlog_api.current_group()) AND user_id=(SELECT bandarlog_api.actor_id())
);
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.check_group_evaluation_response() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.submitted_at IS NOT NULL OR NEW.revision <> OLD.revision + 1 OR NOT EXISTS (
    SELECT FROM public.group_evaluations e
    WHERE (e.group_id,e.id)=(OLD.group_id,OLD.evaluation_id) AND e.due_at > statement_timestamp()
  ) THEN
    RAISE EXCEPTION 'Evaluation is closed or the response revision is invalid' USING ERRCODE='23514';
  END IF;
  IF NEW.submitted_at IS NOT NULL THEN NEW.submitted_at := statement_timestamp(); END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.check_group_evaluation_response() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER check_group_evaluation_response BEFORE UPDATE ON public.group_evaluation_assignments
FOR EACH ROW EXECUTE FUNCTION bandarlog_api.check_group_evaluation_response();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 44 $$;
