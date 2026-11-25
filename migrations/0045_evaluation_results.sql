CREATE TABLE public.group_evaluation_conclusions (
  group_id text NOT NULL DEFAULT nullif(current_setting('bandarlog.group_id', true), ''),
  evaluation_id text NOT NULL,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 8000),
  author_id text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (group_id, evaluation_id),
  FOREIGN KEY (group_id, evaluation_id) REFERENCES public.group_evaluations(group_id, id),
  FOREIGN KEY (group_id, author_id) REFERENCES public.users(group_id, id)
);
--> statement-breakpoint
ALTER TABLE public.group_evaluation_conclusions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON public.group_evaluation_conclusions TO bandarlog_user_app, bandarlog_group_app;
--> statement-breakpoint
GRANT UPDATE (body, author_id, revision, updated_at) ON public.group_evaluation_conclusions TO bandarlog_user_app, bandarlog_group_app;
--> statement-breakpoint
CREATE POLICY conclusion_local ON public.group_evaluation_conclusions TO bandarlog_group_app USING (
  group_id=(SELECT bandarlog_api.current_group())
);
--> statement-breakpoint
CREATE POLICY conclusion_manage ON public.group_evaluation_conclusions TO bandarlog_user_app USING (
  group_id=(SELECT bandarlog_api.current_group()) AND (SELECT bandarlog_api.actor_manages())
) WITH CHECK (
  group_id=(SELECT bandarlog_api.current_group()) AND (SELECT bandarlog_api.actor_manages())
  AND author_id=(SELECT bandarlog_api.actor_id())
  AND EXISTS (SELECT FROM public.group_evaluations e WHERE
    (e.group_id,e.id)=(group_evaluation_conclusions.group_id,group_evaluation_conclusions.evaluation_id)
    AND e.due_at <= statement_timestamp())
);
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.group_evaluation_results(p_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  WITH evaluation AS (
    SELECT e.group_id,e.id,v.structure FROM public.group_evaluations e
    JOIN public.evaluation_template_versions v ON
      (v.group_id,v.template_id,v.revision)=(e.group_id,e.template_id,e.template_revision)
    WHERE e.group_id=(SELECT bandarlog_api.current_group()) AND e.id=p_id
      AND e.due_at <= statement_timestamp()
      AND (current_setting('role',true)='bandarlog_group_app' OR (SELECT bandarlog_api.actor_manages()))
  ), assignments AS MATERIALIZED (
    SELECT a.answers,a.submitted_at FROM public.group_evaluation_assignments a
    JOIN evaluation e ON (e.group_id,e.id)=(a.group_id,a.evaluation_id)
  ), questions AS (
    SELECT question.value->>'id' AS id, question.value->>'type' AS kind
    FROM evaluation e CROSS JOIN LATERAL jsonb_array_elements(e.structure->'sections') section
    CROSS JOIN LATERAL jsonb_array_elements(section.value->'questions') question
  ), answered AS MATERIALIZED (
    SELECT q.id,q.kind, a.answers->q.id AS value FROM questions q CROSS JOIN assignments a
    WHERE a.submitted_at IS NOT NULL AND a.answers ? q.id
  ), counts AS (
    SELECT id,count(*) AS answered FROM answered GROUP BY id
  ), frequencies AS (
    SELECT a.id,choice.value,count(*) AS amount FROM answered a
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(a.value)='array' THEN a.value ELSE jsonb_build_array(a.value) END
    ) choice
    WHERE a.kind IN ('singleChoice','multipleChoice','likert','yesNo','numberScale','nps','tags')
    GROUP BY a.id,choice.value
  ), distributions AS (
    SELECT id,jsonb_agg(jsonb_build_object('value',value,'count',amount) ORDER BY value) AS values
    FROM frequencies GROUP BY id
  )
  SELECT jsonb_build_object(
    'assigned', (SELECT count(*) FROM assignments),
    'submitted', (SELECT count(*) FROM assignments WHERE submitted_at IS NOT NULL),
    'questions', coalesce((SELECT jsonb_object_agg(q.id,jsonb_build_object(
      'answered',coalesce(c.answered,0), 'distribution',coalesce(d.values,'[]'::jsonb)
    )) FROM questions q LEFT JOIN counts c USING(id) LEFT JOIN distributions d USING(id)), '{}'::jsonb)
  ) FROM evaluation
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.group_evaluation_results(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.group_evaluation_results(text) TO bandarlog_user_app, bandarlog_group_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 45 $$;
