ALTER TABLE public.group_evaluations ADD COLUMN closure_event_no bigint,
  ADD CONSTRAINT evaluation_closure_reference CHECK (closure_event_no IS NULL OR project_id IS NOT NULL),
  ADD FOREIGN KEY(group_id,project_id,closure_event_no)
    REFERENCES public.project_lifecycle_events(group_id,project_id,event_no);
--> statement-breakpoint
CREATE INDEX evaluation_closure_event ON public.group_evaluations(group_id,project_id,closure_event_no)
WHERE closure_event_no IS NOT NULL;
--> statement-breakpoint
CREATE TABLE bandarlog_api.evaluation_deadline_history (
  group_id text NOT NULL, evaluation_id text NOT NULL, actor_id text NOT NULL,
  previous_due_at timestamptz NOT NULL, due_at timestamptz NOT NULL,
  reason text NOT NULL, changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (group_id,evaluation_id) REFERENCES public.group_evaluations(group_id,id)
);
--> statement-breakpoint
CREATE TABLE bandarlog_api.evaluation_consolidations (
  group_id text NOT NULL, scope text NOT NULL, revision integer NOT NULL,
  evaluation_ids text[] NOT NULL, report jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (group_id,scope,revision)
);
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.evaluation_deadline(p_id text,p_expected timestamptz,p_due timestamptz,p_reason text,p_actor text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g text := bandarlog_api.current_group();
BEGIN
  IF g IS NULL OR (current_setting('role',true)<>'bandarlog_group_app' AND NOT coalesce(bandarlog_api.actor_manages(),false))
    THEN RETURN false; END IF;
  IF p_due<=clock_timestamp() OR p_due=p_expected OR length(btrim(p_reason)) NOT BETWEEN 1 AND 400 THEN RETURN false; END IF;
  UPDATE public.group_evaluations SET due_at=p_due
  WHERE (group_id,id,due_at)=(g,p_id,p_expected) AND due_at>clock_timestamp();
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO bandarlog_api.evaluation_deadline_history(group_id,evaluation_id,actor_id,previous_due_at,due_at,reason)
  VALUES(g,p_id,CASE WHEN current_setting('role',true)='bandarlog_group_app' THEN p_actor ELSE bandarlog_api.actor_id() END,p_expected,p_due,btrim(p_reason));
  RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.evaluation_deadline_history(p_id text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('dueAt',due_at,'previousDueAt',previous_due_at,'reason',reason,'changedAt',changed_at)
    ORDER BY changed_at DESC),'[]'::jsonb) FROM (
    SELECT * FROM bandarlog_api.evaluation_deadline_history h
    WHERE (h.group_id,h.evaluation_id)=(bandarlog_api.current_group(),p_id)
      AND (current_setting('role',true)='bandarlog_group_app' OR bandarlog_api.actor_manages())
    ORDER BY changed_at DESC LIMIT 30
  ) history
$$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.evaluation_consolidations(p_scope text,p_ids text[],p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g text := bandarlog_api.current_group(); items jsonb; next_revision integer;
BEGIN
  IF g IS NULL OR (current_setting('role',true)<>'bandarlog_group_app' AND NOT coalesce(bandarlog_api.actor_manages(),false))
    THEN RETURN NULL; END IF;
  IF p_ids IS NULL THEN
    IF p_revision IS NOT NULL THEN
      RETURN (SELECT report FROM bandarlog_api.evaluation_consolidations
        WHERE (group_id,scope,revision)=(g,p_scope,p_revision));
    END IF;
    RETURN (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY revision DESC),'[]'::jsonb)
      FROM (SELECT revision,created_at FROM bandarlog_api.evaluation_consolidations
        WHERE (group_id,scope)=(g,p_scope) ORDER BY revision DESC LIMIT 30) r);
  END IF;
  IF cardinality(p_ids) NOT BETWEEN 2 AND 8 OR p_scope !~ '^[a-f0-9]{64}$'
    OR (SELECT count(DISTINCT id) FROM unnest(p_ids) ids(id))<>cardinality(p_ids) THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(g,p_scope)::text,0));
  SELECT jsonb_agg(jsonb_build_object(
    'id',e.id,'title',e.title,'dueAt',e.due_at,'templateId',e.template_id,
    'templateRevision',e.template_revision,'structure',v.structure,'body',c.body,
    'responseMode',e.response_mode,'summary',a.summary
  ) ORDER BY picked.position) INTO items
  FROM unnest(p_ids) WITH ORDINALITY picked(id,position)
  JOIN public.group_evaluations e ON (e.group_id,e.id)=(g,picked.id)
  JOIN public.evaluation_template_versions v ON (v.group_id,v.template_id,v.revision)=(g,e.template_id,e.template_revision)
  LEFT JOIN public.group_evaluation_conclusions c ON (c.group_id,c.evaluation_id)=(g,e.id)
  CROSS JOIN LATERAL (SELECT bandarlog_api.group_evaluation_results(e.id) AS summary) a
  WHERE a.summary IS NOT NULL AND (e.project_id IS NULL OR bandarlog_api.group_evaluation_project_closed(e.id));
  IF coalesce(jsonb_array_length(items),0)<>cardinality(p_ids) THEN RETURN NULL; END IF;
  SELECT coalesce(max(revision),0)+1 INTO next_revision FROM bandarlog_api.evaluation_consolidations
    WHERE (group_id,scope)=(g,p_scope);
  INSERT INTO bandarlog_api.evaluation_consolidations(group_id,scope,revision,evaluation_ids,report)
    VALUES(g,p_scope,next_revision,p_ids,items);
  RETURN jsonb_build_object('revision',next_revision,'reports',items);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.evaluation_deadline(text,timestamptz,timestamptz,text,text),
  bandarlog_api.evaluation_deadline_history(text),bandarlog_api.evaluation_consolidations(text,text[],integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.evaluation_deadline(text,timestamptz,timestamptz,text,text),
  bandarlog_api.evaluation_deadline_history(text),bandarlog_api.evaluation_consolidations(text,text[],integer)
  TO bandarlog_user_app,bandarlog_group_app;
--> statement-breakpoint
CREATE TABLE bandarlog_api.product_campaign_revisions (
  campaign text NOT NULL REFERENCES bandarlog_api.product_campaign_control(campaign),
  version integer NOT NULL,
  configuration jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(campaign,version)
);
--> statement-breakpoint
ALTER TABLE bandarlog_api.product_survey_delivery DROP CONSTRAINT product_survey_delivery_campaign_check,
  ADD FOREIGN KEY(campaign) REFERENCES bandarlog_api.product_campaign_control(campaign),
  ADD COLUMN audience_role text,
  ADD COLUMN activation_cohort text,
  ADD COLUMN adoption text;
--> statement-breakpoint
ALTER TABLE bandarlog_api.product_survey_response
  ADD COLUMN invitation_week date,
  ADD COLUMN audience_role text,
  ADD COLUMN activation_cohort text,
  ADD COLUMN adoption text;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.product_campaign_save(p_token text,p_csrf text,p_campaign text,p_expected integer,p_config jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb; latest integer;
BEGIN
  IF p_csrf IS NULL THEN RAISE EXCEPTION 'csrf required' USING ERRCODE='42501'; END IF;
  actor := bandarlog_api.platform_admin_actor(p_token,p_csrf);
  IF p_campaign !~ '^C-[a-f0-9]{32}$'
    OR coalesce(length(btrim(p_config->>'title')),0) NOT BETWEEN 2 AND 120
    OR coalesce(p_config->>'audience','') NOT IN ('all','management','member')
    OR p_config->>'start' IS NULL OR p_config->>'end' IS NULL
    OR jsonb_typeof(p_config->'questions') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_config->'questions') NOT BETWEEN 1 AND 12
    OR (p_config->>'end')::timestamptz <= (p_config->>'start')::timestamptz
    THEN RAISE EXCEPTION 'Invalid campaign' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT FROM jsonb_array_elements(p_config->'questions') WITH ORDINALITY q(value,position)
    WHERE (value->>'id') IS DISTINCT FROM ('q'||position)
      OR coalesce(length(btrim(value->>'label')),0) NOT BETWEEN 3 AND 220)
    THEN RAISE EXCEPTION 'Invalid campaign questions' USING ERRCODE='22023'; END IF;
  INSERT INTO bandarlog_api.product_campaign_control(campaign) VALUES(p_campaign) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM bandarlog_api.product_campaign_control WHERE campaign=p_campaign FOR UPDATE;
  SELECT coalesce(max(version),0) INTO latest FROM bandarlog_api.product_campaign_revisions WHERE campaign=p_campaign;
  IF latest<>p_expected THEN RETURN NULL; END IF;
  INSERT INTO bandarlog_api.product_campaign_revisions(campaign,version,configuration) VALUES(p_campaign,latest+1,p_config);
  INSERT INTO bandarlog_api.platform_audit(admin_id,action,target)
    VALUES(actor->>'id','campaign.publish',p_campaign);
  RETURN latest+1;
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.product_campaign_library(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM bandarlog_api.platform_admin_actor(p_token);
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(item)),'[]'::jsonb) FROM (
    SELECT r.campaign,r.version,r.configuration,c.paused,
      ARRAY(SELECT previous.version FROM bandarlog_api.product_campaign_revisions previous
        WHERE previous.campaign=r.campaign ORDER BY previous.version DESC LIMIT 30) AS versions
    FROM bandarlog_api.product_campaign_control c
    JOIN LATERAL (SELECT * FROM bandarlog_api.product_campaign_revisions r WHERE r.campaign=c.campaign ORDER BY version DESC LIMIT 1) r ON true
    ORDER BY r.created_at DESC LIMIT 100
  ) item);
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.product_campaign_version(p_token text,p_campaign text,p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM bandarlog_api.platform_admin_actor(p_token);
  RETURN (SELECT configuration FROM bandarlog_api.product_campaign_revisions WHERE (campaign,version)=(p_campaign,p_version));
END $$;
--> statement-breakpoint
CREATE INDEX product_survey_delivery_insights ON bandarlog_api.product_survey_delivery(offered_at);
--> statement-breakpoint
CREATE INDEX product_survey_response_campaign ON bandarlog_api.product_survey_response(campaign,version);
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.product_insights_segments(p_token text,p_dimension text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM bandarlog_api.platform_admin_actor(p_token);
  IF p_dimension NOT IN ('week','role','cohort','adoption') THEN RETURN '[]'::jsonb; END IF;
  RETURN (WITH cells AS (
    SELECT campaign,version,
      CASE p_dimension WHEN 'week' THEN date_trunc('week',offered_at AT TIME ZONE 'UTC')::date::text
        WHEN 'role' THEN audience_role WHEN 'cohort' THEN activation_cohort ELSE adoption END AS segment,
      count(*) AS invited,count(*) FILTER (WHERE submitted_at IS NOT NULL) AS completed,
      count(*) FILTER (WHERE dismissed_at IS NOT NULL) AS dismissed,
      count(DISTINCT group_id) FILTER (WHERE submitted_at IS NOT NULL) AS groups,
      count(DISTINCT group_id) FILTER (WHERE submitted_at IS NULL) AS other_groups
    FROM bandarlog_api.product_survey_delivery
    WHERE offered_at>=date_trunc('week',statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'-interval '12 weeks'
      AND offered_at<date_trunc('week',statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    GROUP BY 1,2,3
  ), scores AS (
    SELECT campaign,version,
      CASE p_dimension WHEN 'week' THEN invitation_week::text WHEN 'role' THEN audience_role
        WHEN 'cohort' THEN activation_cohort ELSE adoption END AS segment,
      CASE WHEN count(sus)>=10 AND min(sus)<>max(sus) THEN round(avg(sus),1) END AS sus,
      CASE WHEN count(nps)>=10
        AND (count(*) FILTER (WHERE nps>=9)=0 OR count(*) FILTER (WHERE nps>=9)>=5)
        AND (count(*) FILTER (WHERE nps<=6)=0 OR count(*) FILTER (WHERE nps<=6)>=5)
        AND (count(*) FILTER (WHERE nps BETWEEN 7 AND 8)=0 OR count(*) FILTER (WHERE nps BETWEEN 7 AND 8)>=5)
        AND ((max(nps)>=9) IS DISTINCT FROM (min(nps)>=9) OR (max(nps)<=6) IS DISTINCT FROM (min(nps)<=6))
        THEN round(100.0*(count(*) FILTER (WHERE nps>=9)-count(*) FILTER (WHERE nps<=6))/count(nps),1) END AS nps,
      CASE WHEN count(satisfaction)>=10 AND min(satisfaction)<>max(satisfaction)
        THEN round(avg(satisfaction),1) END AS satisfaction
    FROM bandarlog_api.product_survey_response
    WHERE invitation_week >= date_trunc('week',statement_timestamp() AT TIME ZONE 'UTC')::date-84
      AND invitation_week < date_trunc('week',statement_timestamp() AT TIME ZONE 'UTC')::date
    GROUP BY 1,2,3
  )
  SELECT coalesce(jsonb_agg((to_jsonb(c) - 'groups' - 'other_groups') ||
    jsonb_build_object('sus',s.sus,'nps',s.nps,'satisfaction',s.satisfaction)
    ORDER BY c.campaign,c.version,c.segment),'[]'::jsonb) FROM cells c
  LEFT JOIN scores s USING(campaign,version,segment)
  WHERE c.segment IS NOT NULL AND groups>=3 AND other_groups>=3 AND completed>=5 AND invited-completed>=5
    AND (dismissed=0 OR (dismissed>=5 AND invited-completed-dismissed>=5)));
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.product_campaign_results(p_token text,p_campaign text,p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM bandarlog_api.platform_admin_actor(p_token);
  RETURN (WITH counts AS (
    SELECT key,(value #>> '{}')::integer AS score,count(*) AS responses
    FROM bandarlog_api.product_survey_response,
      LATERAL jsonb_each(CASE WHEN jsonb_typeof(answers->'ratings')='object' THEN answers->'ratings' ELSE '{}'::jsonb END)
    WHERE (campaign,version)=(p_campaign,p_version) GROUP BY 1,2
  ), public_questions AS (
    SELECT key,sum(responses) AS sample,round(sum(score*responses)::numeric/sum(responses),2) AS average
    FROM counts GROUP BY key HAVING sum(responses)>=5 AND count(*)>=2 AND min(responses)>=5
  )
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY key),'[]'::jsonb) FROM public_questions q
  WHERE (SELECT count(DISTINCT group_id) FROM bandarlog_api.product_survey_delivery
    WHERE (campaign,version)=(p_campaign,p_version) AND submitted_at IS NOT NULL)>=3);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.product_campaign_save(text,text,text,integer,jsonb),
  bandarlog_api.product_campaign_library(text),bandarlog_api.product_campaign_version(text,text,integer),
  bandarlog_api.product_insights_segments(text,text),bandarlog_api.product_campaign_results(text,text,integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.product_campaign_save(text,text,text,integer,jsonb),
  bandarlog_api.product_campaign_library(text),bandarlog_api.product_campaign_version(text,text,integer),
  bandarlog_api.product_insights_segments(text,text),bandarlog_api.product_campaign_results(text,text,integer) TO bandarlog_identity;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.product_survey(p_id uuid,p_action text,p_answers jsonb,p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  scoped_group text := bandarlog_api.current_group();
  actor text := CASE WHEN current_setting('role',true)='bandarlog_group_app'
    THEN nullif(current_setting('bandarlog.survey_actor',true),'') ELSE bandarlog_api.actor_id() END;
  epoch timestamptz;
  elapsed integer;
  kind text;
  cycle integer;
  validity integer;
  entry bandarlog_api.product_survey_delivery;
  sus_score numeric;
  settings jsonb;
  existing bandarlog_api.product_survey_delivery;
  custom_version integer;
  role_at_offer text;
  adoption_at_offer text;
  cohort_at_offer text;
  effective_deadline timestamptz;
BEGIN
  IF NOT EXISTS (SELECT FROM public.users WHERE (group_id,id)=(scoped_group,actor) AND disabled_at IS NULL)
  THEN RETURN NULL; END IF;

  IF p_action='offer' THEN
    SELECT created_at INTO epoch FROM public.scout_groups WHERE id=scoped_group AND plan<>'audit-archived';
    IF epoch IS NULL THEN RETURN NULL; END IF;
    SELECT CASE WHEN role IN ('admin','coordination') THEN 'management' ELSE 'member' END,
      CASE WHEN onboarding_completed_at IS NULL THEN 'pending' ELSE 'completed' END
    INTO role_at_offer,adoption_at_offer FROM public.users WHERE (group_id,id)=(scoped_group,actor);
    cohort_at_offer := to_char(epoch AT TIME ZONE 'UTC','YYYY-"T"Q');
    SELECT d.* INTO existing FROM bandarlog_api.product_survey_delivery d
    JOIN bandarlog_api.product_campaign_control c ON c.campaign=d.campaign AND NOT c.paused
    WHERE (d.group_id,d.user_id)=(scoped_group,actor) AND d.expires_at>statement_timestamp()
      AND d.submitted_at IS NULL AND d.dismissed_at IS NULL
      AND (d.postponed_until IS NULL OR d.postponed_until<=statement_timestamp())
    ORDER BY d.offered_at,d.id LIMIT 1;
    IF FOUND THEN
      IF existing.campaign LIKE 'C-%' THEN
        SELECT configuration INTO settings FROM bandarlog_api.product_campaign_revisions
        WHERE (campaign,version)=(existing.campaign,existing.version);
      END IF;
      RETURN jsonb_build_object('id',existing.id,'campaign',existing.campaign,'version',existing.version)
        || CASE WHEN settings IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('configuration',
          jsonb_build_object('title',settings->>'title','questions',settings->'questions')) END;
    END IF;
    elapsed := floor(extract(epoch FROM statement_timestamp()-epoch)/86400)::integer;
    IF elapsed BETWEEN 7 AND 20 AND EXISTS (
      SELECT FROM public.users u WHERE (u.group_id,u.id)=(scoped_group,actor)
      AND (u.role IN ('admin','coordination') OR u.preferences::jsonb->>'foundingAdmin'='true')
    ) THEN
      kind := 'F01'; cycle := 1; validity := 21;
    ELSIF elapsed BETWEEN 30 AND 50 THEN
      kind := 'F02'; cycle := 1; validity := 51;
    ELSIF elapsed>=60 AND elapsed%60<21 THEN
      kind := 'F03'; cycle := elapsed/60; validity := cycle*60+21;
    END IF;
    IF kind IS NULL OR NOT EXISTS (
      SELECT FROM bandarlog_api.product_campaign_control WHERE campaign=kind AND NOT paused
    ) OR EXISTS (
      SELECT FROM bandarlog_api.product_survey_delivery d
      WHERE (d.group_id,d.user_id,d.campaign,d.round)=(scoped_group,actor,kind,cycle)
        AND (d.submitted_at IS NOT NULL OR d.dismissed_at IS NOT NULL OR d.postponed_until>statement_timestamp())
    ) THEN
      SELECT r.campaign,r.version,r.configuration INTO kind,custom_version,settings
      FROM bandarlog_api.product_campaign_control c
      JOIN LATERAL (SELECT * FROM bandarlog_api.product_campaign_revisions r
        WHERE r.campaign=c.campaign ORDER BY version DESC LIMIT 1) r ON true
      WHERE NOT c.paused AND (r.configuration->>'start')::timestamptz<=statement_timestamp()
        AND (r.configuration->>'end')::timestamptz>statement_timestamp()
        AND r.configuration->>'audience' IN ('all',role_at_offer)
        AND NOT EXISTS (SELECT FROM bandarlog_api.product_survey_delivery d
          WHERE (d.group_id,d.user_id,d.campaign)=(scoped_group,actor,r.campaign))
      ORDER BY (r.configuration->>'start')::timestamptz,r.campaign LIMIT 1;
      IF NOT FOUND THEN RETURN NULL; END IF;
      cycle := 1;
      effective_deadline := (settings->>'end')::timestamptz;
    ELSE
      effective_deadline := epoch+validity*interval '24 hours';
    END IF;
    IF NOT EXISTS (SELECT FROM bandarlog_api.product_campaign_control WHERE campaign=kind AND NOT paused)
      THEN RETURN NULL; END IF;
    INSERT INTO bandarlog_api.product_survey_delivery(group_id,user_id,campaign,round,version,expires_at,
      audience_role,activation_cohort,adoption)
    VALUES(scoped_group,actor,kind,cycle,coalesce(custom_version,1),effective_deadline,
      role_at_offer,cohort_at_offer,adoption_at_offer)
    ON CONFLICT(group_id,user_id,campaign,round) DO NOTHING;
    SELECT * INTO entry FROM bandarlog_api.product_survey_delivery
    WHERE (group_id,user_id,campaign,round)=(scoped_group,actor,kind,cycle)
      AND submitted_at IS NULL AND dismissed_at IS NULL AND expires_at>statement_timestamp()
      AND (postponed_until IS NULL OR postponed_until<=statement_timestamp());
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF entry.campaign LIKE 'C-%' THEN
      SELECT configuration INTO settings FROM bandarlog_api.product_campaign_revisions
      WHERE (campaign,version)=(entry.campaign,entry.version);
    END IF;
    RETURN jsonb_build_object('id',entry.id,'campaign',entry.campaign,'version',entry.version)
      || CASE WHEN settings IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('configuration',
        jsonb_build_object('title',settings->>'title','questions',settings->'questions')) END;
  END IF;

  SELECT * INTO entry FROM bandarlog_api.product_survey_delivery
  WHERE (group_id,user_id,id)=(scoped_group,actor,p_id) AND expires_at>statement_timestamp()
    AND submitted_at IS NULL AND dismissed_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT FROM bandarlog_api.product_campaign_control WHERE campaign=entry.campaign AND NOT paused
  ) THEN RETURN NULL; END IF;

  IF p_action='postpone' THEN
    UPDATE bandarlog_api.product_survey_delivery SET postponed_until=statement_timestamp()+interval '72 hours' WHERE id=entry.id;
  ELSIF p_action='dismiss' THEN
    UPDATE bandarlog_api.product_survey_delivery SET dismissed_at=statement_timestamp() WHERE id=entry.id;
  ELSIF p_action='submit' THEN
    IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' OR octet_length(p_answers::text)>10000
      THEN RAISE EXCEPTION 'Invalid survey answer' USING ERRCODE='22023'; END IF;
    IF entry.campaign='F01' AND EXISTS (
      SELECT FROM unnest(ARRAY['easy','questions','help','blocked']) AS fields(key)
      WHERE jsonb_typeof(p_answers->key) IS DISTINCT FROM 'boolean'
    ) THEN RAISE EXCEPTION 'Incomplete first week feedback' USING ERRCODE='22023'; END IF;
    IF entry.campaign='F02' THEN
      IF jsonb_typeof(p_answers->'sus') IS DISTINCT FROM 'array' OR jsonb_array_length(p_answers->'sus')<>10
        OR EXISTS (SELECT FROM jsonb_array_elements(p_answers->'sus') a(value)
                   WHERE jsonb_typeof(value)<>'number' OR value::text !~ '^[1-5]$')
      THEN RAISE EXCEPTION 'Incomplete SUS scale' USING ERRCODE='22023'; END IF;
      SELECT sum(CASE WHEN position%2=1 THEN value::integer-1 ELSE 5-value::integer END)*2.5
      INTO sus_score FROM jsonb_array_elements_text(p_answers->'sus') WITH ORDINALITY a(value,position);
    ELSIF entry.campaign='F03' THEN
      IF coalesce(p_answers->>'nps','') !~ '^([0-9]|10)$'
        OR jsonb_typeof(p_answers->'scores') IS DISTINCT FROM 'array' OR jsonb_array_length(p_answers->'scores')<>6
        OR EXISTS (SELECT FROM jsonb_array_elements(p_answers->'scores') a(value)
                   WHERE jsonb_typeof(value)<>'number' OR value::text !~ '^[1-5]$')
      THEN RAISE EXCEPTION 'Invalid general feedback scales' USING ERRCODE='22023'; END IF;
    END IF;
    IF entry.campaign LIKE 'C-%' THEN
      SELECT configuration INTO settings FROM bandarlog_api.product_campaign_revisions
      WHERE (campaign,version)=(entry.campaign,entry.version);
      IF jsonb_typeof(p_answers->'ratings') IS DISTINCT FROM 'object'
        OR EXISTS (SELECT FROM jsonb_array_elements(settings->'questions') q
          WHERE coalesce(p_answers->'ratings'->>(q->>'id'),'') !~ '^[1-5]$')
        OR EXISTS (SELECT FROM jsonb_each(p_answers->'ratings') a
          WHERE NOT EXISTS (SELECT FROM jsonb_array_elements(settings->'questions') q WHERE q->>'id'=a.key))
      THEN RAISE EXCEPTION 'Invalid campaign ratings' USING ERRCODE='22023'; END IF;
    END IF;
    INSERT INTO bandarlog_api.product_survey_response(campaign,version,sus,nps,satisfaction,answers,
      invitation_week,audience_role,activation_cohort,adoption)
    VALUES(entry.campaign,entry.version,sus_score,
      CASE WHEN entry.campaign='F03' THEN (p_answers->>'nps')::integer END,
      CASE WHEN entry.campaign='F03' THEN (p_answers->'scores'->>5)::integer END,p_answers,
      date_trunc('week',entry.offered_at AT TIME ZONE 'UTC')::date,
      entry.audience_role,entry.activation_cohort,entry.adoption);
    IF entry.campaign='F01' AND p_answers->'help'='true'::jsonb THEN
      INSERT INTO bandarlog_api.product_feedback(category,body,reply_email)
      VALUES('help',coalesce(nullif(btrim(p_answers->>'detail'),''),'Solicitud de ayuda desde la encuesta de primera semana.'),nullif(btrim(p_email),''));
    END IF;
    UPDATE bandarlog_api.product_survey_delivery SET submitted_at=statement_timestamp() WHERE id=entry.id;
  ELSE RETURN NULL;
  END IF;
  RETURN jsonb_build_object('ok',true);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 52 $$;
