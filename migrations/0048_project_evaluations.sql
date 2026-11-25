ALTER TABLE public.group_evaluations ADD COLUMN project_id text,
  ADD FOREIGN KEY (group_id,project_id) REFERENCES public.projects(group_id,id);
--> statement-breakpoint
CREATE INDEX project_group_evaluations ON public.group_evaluations(group_id,project_id)
WHERE project_id IS NOT NULL;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.group_evaluation_project_closed(p_id text, p_lock boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target_group text := bandarlog_api.current_group();
        target_project text;
        archived text;
BEGIN
  IF current_setting('role',true) <> 'bandarlog_group_app' THEN
    IF NOT coalesce(bandarlog_api.actor_manages(),false) AND NOT EXISTS (
      SELECT FROM public.group_evaluation_assignments a
      WHERE (a.group_id,a.evaluation_id,a.user_id)=(target_group,p_id,bandarlog_api.actor_id())
    ) THEN RETURN false; END IF;
  END IF;
  SELECT e.project_id INTO target_project FROM public.group_evaluations e
  WHERE (e.group_id,e.id)=(target_group,p_id);
  IF NOT FOUND THEN RETURN false; END IF;
  IF target_project IS NULL THEN RETURN true; END IF;
  IF p_lock THEN
    SELECT p.archived INTO archived FROM public.projects p
    WHERE (p.group_id,p.id)=(target_group,target_project) FOR SHARE;
  ELSE
    SELECT p.archived INTO archived FROM public.projects p
    WHERE (p.group_id,p.id)=(target_group,target_project);
  END IF;
  RETURN coalesce(archived='true',false);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.group_evaluation_project_closed(text,boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.group_evaluation_project_closed(text,boolean) TO bandarlog_user_app, bandarlog_group_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.check_group_evaluation_response() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE evaluation public.group_evaluations%ROWTYPE;
BEGIN
  SELECT * INTO evaluation FROM public.group_evaluations e
  WHERE (e.group_id,e.id)=(OLD.group_id,OLD.evaluation_id);
  IF OLD.submitted_at IS NOT NULL OR NEW.revision <> OLD.revision + 1 OR NOT FOUND OR
     (evaluation.project_id IS NOT NULL AND NOT bandarlog_api.group_evaluation_project_closed(evaluation.id,true)) OR
     clock_timestamp() >= evaluation.due_at THEN
    RAISE EXCEPTION 'Evaluation is closed or the response revision is invalid' USING ERRCODE='23514';
  END IF;
  IF NEW.submitted_at IS NOT NULL THEN NEW.submitted_at := clock_timestamp(); END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 48 $$;
