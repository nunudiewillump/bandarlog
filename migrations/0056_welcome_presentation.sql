CREATE TABLE public.welcome_presentation (
  group_id text NOT NULL,
  user_id text NOT NULL,
  version integer NOT NULL,
  viewed_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  reopened_at timestamptz,
  PRIMARY KEY (group_id, user_id, version),
  FOREIGN KEY (group_id, user_id) REFERENCES public.users(group_id,id) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE public.welcome_presentation ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.welcome_presentation TO bandarlog_user_app, bandarlog_group_app;
--> statement-breakpoint
GRANT UPDATE (viewed_at, completed_at, skipped_at, reopened_at) ON public.welcome_presentation TO bandarlog_user_app, bandarlog_group_app;
--> statement-breakpoint
CREATE POLICY welcome_actor ON public.welcome_presentation TO bandarlog_user_app
  USING (group_id=(SELECT bandarlog_api.current_group()) AND user_id=(SELECT bandarlog_api.actor_id()))
  WITH CHECK (group_id=(SELECT bandarlog_api.current_group()) AND user_id=(SELECT bandarlog_api.actor_id()));
--> statement-breakpoint
CREATE POLICY welcome_group ON public.welcome_presentation TO bandarlog_group_app
  USING (group_id=(SELECT bandarlog_api.current_group()))
  WITH CHECK (group_id=(SELECT bandarlog_api.current_group()));
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.welcome_presentation_stats(p_version integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('viewed', count(viewed_at), 'completed', count(completed_at),
    'skipped', count(skipped_at), 'reopened', count(reopened_at))
  FROM public.welcome_presentation
  WHERE group_id=bandarlog_api.current_group() AND version=p_version
    AND CASE WHEN current_setting('role',true)='bandarlog_group_app' THEN true
      ELSE bandarlog_api.actor_manages(true) END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.welcome_presentation_stats(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.welcome_presentation_stats(integer) TO bandarlog_user_app, bandarlog_group_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 56 $$;
