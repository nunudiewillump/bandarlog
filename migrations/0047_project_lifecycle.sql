CREATE TABLE public.project_lifecycle_events (
  event_no bigint GENERATED ALWAYS AS IDENTITY,
  group_id text NOT NULL DEFAULT nullif(current_setting('bandarlog.group_id', true), ''),
  project_id text NOT NULL,
  actor_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('closed','reopened')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (group_id, project_id, event_no),
  FOREIGN KEY (group_id, project_id) REFERENCES public.projects(group_id, id),
  FOREIGN KEY (group_id, actor_id) REFERENCES public.users(group_id, id)
);
--> statement-breakpoint
ALTER TABLE public.project_lifecycle_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON public.project_lifecycle_events TO bandarlog_user_app, bandarlog_group_app;
--> statement-breakpoint
GRANT INSERT (group_id, project_id, actor_id, kind) ON public.project_lifecycle_events TO bandarlog_user_app, bandarlog_group_app;
--> statement-breakpoint
CREATE POLICY project_lifecycle_local ON public.project_lifecycle_events TO bandarlog_group_app
USING (group_id=(SELECT bandarlog_api.current_group()));
--> statement-breakpoint
CREATE POLICY project_lifecycle_manager ON public.project_lifecycle_events TO bandarlog_user_app
USING (group_id=(SELECT bandarlog_api.current_group()) AND (SELECT bandarlog_api.actor_manages()))
WITH CHECK (group_id=(SELECT bandarlog_api.current_group()) AND (SELECT bandarlog_api.actor_manages())
  AND actor_id=(SELECT bandarlog_api.actor_id()));
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.guard_project_lifecycle_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE
  archived text;
  previous public.project_lifecycle_events%ROWTYPE;
BEGIN
  SELECT p.archived INTO archived FROM public.projects p
  WHERE (p.group_id,p.id)=(NEW.group_id,NEW.project_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project unavailable' USING ERRCODE='23514'; END IF;
  SELECT * INTO previous FROM public.project_lifecycle_events e
  WHERE (e.group_id,e.project_id)=(NEW.group_id,NEW.project_id)
  ORDER BY e.event_no DESC LIMIT 1;
  NEW.created_at := clock_timestamp();
  IF NEW.kind='closed' AND (archived='true' OR previous.kind='closed') OR
     NEW.kind='reopened' AND (archived<>'true' OR previous.kind IS DISTINCT FROM 'closed'
       OR NEW.created_at >= previous.created_at + interval '360 hours') THEN
    RAISE EXCEPTION 'Project lifecycle transition unavailable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER guard_project_lifecycle_event BEFORE INSERT ON public.project_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_project_lifecycle_event();
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.guard_project_archive() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE latest text;
BEGIN
  IF NEW.archived IS NOT DISTINCT FROM OLD.archived THEN RETURN NEW; END IF;
  SELECT kind INTO latest FROM public.project_lifecycle_events e
  WHERE (e.group_id,e.project_id)=(OLD.group_id,OLD.id)
  ORDER BY e.event_no DESC LIMIT 1;
  IF latest IS NOT NULL AND (latest='closed') IS DISTINCT FROM (NEW.archived='true') THEN
    RAISE EXCEPTION 'Use the project lifecycle operation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER guard_project_archive BEFORE UPDATE OF archived ON public.projects
FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_project_archive();
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.apply_project_lifecycle_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  UPDATE public.projects SET archived=(NEW.kind='closed')::text
  WHERE (group_id,id)=(NEW.group_id,NEW.project_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Project unavailable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER apply_project_lifecycle_event AFTER INSERT ON public.project_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION bandarlog_api.apply_project_lifecycle_event();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 47 $$;
