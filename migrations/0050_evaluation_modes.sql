ALTER TABLE public.group_evaluations
  ADD COLUMN response_mode text NOT NULL DEFAULT 'identified'
    CHECK (response_mode IN ('identified','anonymous','collective')),
  ADD COLUMN commission_id text,
  ADD FOREIGN KEY (group_id,project_id,commission_id) REFERENCES public.commissions(group_id,project_id,id),
  ADD CHECK (commission_id IS NULL OR project_id IS NOT NULL);
--> statement-breakpoint
CREATE TABLE bandarlog_api.anonymous_evaluation_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id text NOT NULL,
  evaluation_id text NOT NULL,
  answers jsonb NOT NULL CHECK (jsonb_typeof(answers)='object'),
  FOREIGN KEY (group_id,evaluation_id) REFERENCES public.group_evaluations(group_id,id)
);
--> statement-breakpoint
REVOKE ALL ON bandarlog_api.anonymous_evaluation_answers FROM PUBLIC;
--> statement-breakpoint
CREATE INDEX anonymous_evaluation_answers_scope ON bandarlog_api.anonymous_evaluation_answers(group_id,evaluation_id);
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.store_anonymous_evaluation_answer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.submitted_at IS NULL AND NEW.submitted_at IS NOT NULL AND EXISTS (
    SELECT FROM public.group_evaluations e
    WHERE (e.group_id,e.id)=(OLD.group_id,OLD.evaluation_id) AND e.response_mode='anonymous'
  ) THEN
    INSERT INTO bandarlog_api.anonymous_evaluation_answers(group_id,evaluation_id,answers)
    VALUES (OLD.group_id,OLD.evaluation_id,NEW.answers);
    NEW.answers := '{}'::jsonb;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.store_anonymous_evaluation_answer() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER store_anonymous_evaluation_answer BEFORE UPDATE ON public.group_evaluation_assignments
FOR EACH ROW EXECUTE FUNCTION bandarlog_api.store_anonymous_evaluation_answer();
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.guard_collective_evaluation_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF EXISTS (
    SELECT FROM public.group_evaluations e
    WHERE (e.group_id,e.id)=(NEW.group_id,NEW.evaluation_id) AND e.response_mode='collective'
    FOR UPDATE
  ) AND EXISTS (
    SELECT FROM public.group_evaluation_assignments a
    WHERE (a.group_id,a.evaluation_id)=(NEW.group_id,NEW.evaluation_id)
  ) THEN
    RAISE EXCEPTION 'Collective evaluations accept one representative' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.guard_collective_evaluation_assignment() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER guard_collective_evaluation_assignment BEFORE INSERT ON public.group_evaluation_assignments
FOR EACH ROW EXECUTE FUNCTION bandarlog_api.guard_collective_evaluation_assignment();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.group_evaluation_results(p_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  WITH evaluation AS (
    SELECT e.group_id,e.id,e.response_mode,v.structure FROM public.group_evaluations e
    JOIN public.evaluation_template_versions v ON
      (v.group_id,v.template_id,v.revision)=(e.group_id,e.template_id,e.template_revision)
    WHERE e.group_id=(SELECT bandarlog_api.current_group()) AND e.id=p_id
      AND e.due_at <= statement_timestamp()
      AND (current_setting('role',true)='bandarlog_group_app' OR (SELECT bandarlog_api.actor_manages()))
  ), assignments AS MATERIALIZED (
    SELECT a.answers,a.submitted_at FROM public.group_evaluation_assignments a
    JOIN evaluation e ON (e.group_id,e.id)=(a.group_id,a.evaluation_id)
  ), submitted AS (
    SELECT a.answers FROM assignments a CROSS JOIN evaluation e
    WHERE a.submitted_at IS NOT NULL AND e.response_mode<>'anonymous'
    UNION ALL
    SELECT a.answers FROM bandarlog_api.anonymous_evaluation_answers a
    JOIN evaluation e ON (e.group_id,e.id)=(a.group_id,a.evaluation_id)
  ), questions AS (
    SELECT question.value->>'id' AS id, question.value->>'type' AS kind
    FROM evaluation e CROSS JOIN LATERAL jsonb_array_elements(e.structure->'sections') section
    CROSS JOIN LATERAL jsonb_array_elements(section.value->'questions') question
  ), answered AS MATERIALIZED (
    SELECT q.id,q.kind, a.answers->q.id AS value FROM questions q CROSS JOIN submitted a
    WHERE a.answers ? q.id
  ), counts AS (
    SELECT id,count(*) AS answered FROM answered GROUP BY id
  ), frequencies AS (
    SELECT a.id,choice.value,count(*) AS amount FROM answered a
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(a.value)='array' THEN a.value ELSE jsonb_build_array(a.value) END
    ) choice
    WHERE a.kind IN ('singleChoice','multipleChoice','likert','yesNo','numberScale','nps','tags')
      AND (a.kind<>'tags' OR (SELECT response_mode FROM evaluation)<>'anonymous')
    GROUP BY a.id,choice.value
  ), distributions AS (
    SELECT id,jsonb_agg(jsonb_build_object('value',value,'count',amount) ORDER BY value) AS values
    FROM frequencies GROUP BY id
    HAVING (SELECT response_mode FROM evaluation)<>'anonymous' OR (min(amount)>=5 AND count(*)>=2)
  )
  SELECT jsonb_build_object(
    'assigned', (SELECT count(*) FROM assignments),
    'submitted', (SELECT count(*) FROM assignments WHERE submitted_at IS NOT NULL),
    'questions', coalesce((SELECT jsonb_object_agg(q.id,jsonb_build_object(
      'answered',coalesce(c.answered,0), 'distribution',coalesce(d.values,'[]'::jsonb)
    )) FROM questions q LEFT JOIN counts c USING(id) LEFT JOIN distributions d USING(id)
      WHERE evaluation.response_mode<>'anonymous' OR c.answered>=5), '{}'::jsonb)
  ) FROM evaluation
  WHERE response_mode<>'anonymous' OR (SELECT count(*) FROM submitted)>=5
$$;
--> statement-breakpoint
CREATE TABLE bandarlog_api.evaluation_annex_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id text NOT NULL,
  evaluation_id text NOT NULL,
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  FOREIGN KEY (group_id,evaluation_id) REFERENCES public.group_evaluations(group_id,id),
  FOREIGN KEY (group_id,actor_id) REFERENCES public.users(group_id,id)
);
--> statement-breakpoint
REVOKE ALL ON bandarlog_api.evaluation_annex_audit FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.group_evaluation_annex(p_id text,p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE scoped_group text := bandarlog_api.current_group();
BEGIN
  IF current_setting('role',true)='bandarlog_group_app' THEN
    IF NOT EXISTS (SELECT FROM public.users WHERE (group_id,id)=(scoped_group,p_actor)
      AND role='admin' AND disabled_at IS NULL) THEN
      RAISE EXCEPTION 'Annex requires group administration' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NOT coalesce(bandarlog_api.actor_manages(true),false) OR p_actor IS DISTINCT FROM bandarlog_api.actor_id() THEN
      RAISE EXCEPTION 'Annex requires group administration' USING ERRCODE='42501';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT FROM public.group_evaluations
    WHERE (group_id,id)=(scoped_group,p_id) AND response_mode<>'anonymous'
      AND due_at<=statement_timestamp())
  THEN RETURN NULL; END IF;
  INSERT INTO bandarlog_api.evaluation_annex_audit(group_id,evaluation_id,actor_id)
  VALUES (scoped_group,p_id,p_actor);
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(items)),'[]'::jsonb)
    FROM (SELECT u.name,a.answers FROM public.group_evaluation_assignments a
      JOIN public.users u ON (u.group_id,u.id)=(a.group_id,a.user_id)
      WHERE (a.group_id,a.evaluation_id)=(scoped_group,p_id) AND a.submitted_at IS NOT NULL
      ORDER BY u.name,u.id LIMIT 100) items);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.group_evaluation_annex(text,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.group_evaluation_annex(text,text) TO bandarlog_user_app,bandarlog_group_app;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.queue_group_evaluation_reminder(p_id text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE scoped_group text := bandarlog_api.current_group();
        inserted integer;
BEGIN
  IF current_setting('role',true)<>'bandarlog_group_app'
    AND NOT coalesce(bandarlog_api.actor_manages(),false) THEN
    RAISE EXCEPTION 'Reminder requires group management' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT FROM public.group_evaluations e
    WHERE (e.group_id,e.id)=(scoped_group,p_id) AND e.due_at>statement_timestamp()
      AND (e.project_id IS NULL OR bandarlog_api.group_evaluation_project_closed(e.id,true)))
  THEN RETURN NULL; END IF;
  INSERT INTO public.notifications(group_id,id,dedupe,email,subject,body,html,status,created_at)
  SELECT a.group_id,stable.key,stable.key,u.email,'Evaluación pendiente · Bandarlog',
    'evaluation-reminder-v1:','','pending_v2',statement_timestamp()
  FROM public.group_evaluation_assignments a
  JOIN public.users u ON (u.group_id,u.id)=(a.group_id,a.user_id)
  CROSS JOIN LATERAL (SELECT encode(sha256(convert_to(
    'evaluation-reminder-v1:'||jsonb_build_array(a.group_id,a.evaluation_id,a.user_id)::text,'UTF8'
  )),'hex') AS key) stable
  WHERE (a.group_id,a.evaluation_id)=(scoped_group,p_id)
    AND a.submitted_at IS NULL AND u.disabled_at IS NULL
    AND coalesce(u.preferences::jsonb->'notifications','true'::jsonb)='true'::jsonb
  ON CONFLICT(dedupe) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.queue_group_evaluation_reminder(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.queue_group_evaluation_reminder(text) TO bandarlog_user_app,bandarlog_group_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 50 $$;

--> statement-breakpoint
CREATE FUNCTION bandarlog_api.product_feedback_insights(p_token text,p_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM bandarlog_api.platform_admin_actor(p_token);
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(summary) ORDER BY summary.day, summary.category),'[]'::jsonb)
    FROM (
      SELECT (created_at AT TIME ZONE 'UTC')::date AS day, category, count(*)::integer AS total,
        count(*) FILTER (WHERE status IN ('new','reviewing','in_progress'))::integer AS pending
      FROM bandarlog_api.product_feedback
      WHERE created_at >= statement_timestamp() - make_interval(days => CASE WHEN p_days=30 THEN 30 ELSE 7 END)
      GROUP BY 1,2
    ) summary);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.product_feedback_insights(text,integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.product_feedback_insights(text,integer) TO bandarlog_identity;
