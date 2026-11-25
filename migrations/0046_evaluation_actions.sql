CREATE TABLE public.group_evaluation_actions (
  group_id text NOT NULL DEFAULT nullif(current_setting('bandarlog.group_id', true), ''),
  evaluation_id text NOT NULL,
  task_id text NOT NULL,
  conclusion_revision integer NOT NULL CHECK (conclusion_revision > 0),
  PRIMARY KEY (group_id, task_id),
  FOREIGN KEY (group_id, evaluation_id) REFERENCES public.group_evaluation_conclusions(group_id, evaluation_id),
  FOREIGN KEY (group_id, task_id) REFERENCES public.tasks(group_id, id)
);
--> statement-breakpoint
CREATE INDEX group_evaluation_actions_evaluation ON public.group_evaluation_actions(group_id,evaluation_id,task_id);
--> statement-breakpoint
ALTER TABLE public.group_evaluation_actions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.group_evaluation_actions TO bandarlog_user_app, bandarlog_group_app;
--> statement-breakpoint
CREATE POLICY evaluation_action_local ON public.group_evaluation_actions TO bandarlog_group_app
USING (group_id=(SELECT bandarlog_api.current_group()));
--> statement-breakpoint
CREATE POLICY evaluation_action_manage ON public.group_evaluation_actions TO bandarlog_user_app
USING (
  group_id=(SELECT bandarlog_api.current_group())
  AND (SELECT bandarlog_api.actor_manages())
  AND EXISTS (SELECT FROM public.tasks t WHERE (t.group_id,t.id)=(group_evaluation_actions.group_id,group_evaluation_actions.task_id) AND t.deleted_at IS NULL)
)
WITH CHECK (
  group_id=(SELECT bandarlog_api.current_group())
  AND (SELECT bandarlog_api.actor_manages())
  AND bandarlog_api.actor_task(task_id,true)
  AND EXISTS (SELECT FROM public.group_evaluation_conclusions c WHERE
    (c.group_id,c.evaluation_id,c.revision)=(group_evaluation_actions.group_id,group_evaluation_actions.evaluation_id,group_evaluation_actions.conclusion_revision))
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 46 $$;
