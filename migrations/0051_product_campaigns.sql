CREATE TABLE bandarlog_api.product_campaign_control (
  campaign text PRIMARY KEY,
  paused boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
INSERT INTO bandarlog_api.product_campaign_control(campaign) VALUES ('F01'),('F02'),('F03');
--> statement-breakpoint
REVOKE ALL ON bandarlog_api.product_campaign_control FROM PUBLIC;
--> statement-breakpoint
CREATE TABLE bandarlog_api.product_survey_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id text NOT NULL,
  user_id text NOT NULL,
  campaign text NOT NULL CHECK (campaign IN ('F01','F02','F03')),
  round integer NOT NULL,
  version integer NOT NULL DEFAULT 1,
  offered_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  expires_at timestamptz NOT NULL,
  postponed_until timestamptz,
  dismissed_at timestamptz,
  submitted_at timestamptz,
  reminded_at timestamptz,
  FOREIGN KEY (group_id,user_id) REFERENCES public.users(group_id,id) ON DELETE CASCADE,
  UNIQUE (group_id,user_id,campaign,round)
);
--> statement-breakpoint
CREATE INDEX product_survey_pending ON bandarlog_api.product_survey_delivery(offered_at)
WHERE reminded_at IS NULL AND dismissed_at IS NULL AND submitted_at IS NULL;
--> statement-breakpoint
CREATE TABLE bandarlog_api.product_survey_response (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign text NOT NULL,
  version integer NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  sus numeric CHECK (sus BETWEEN 0 AND 100),
  nps integer CHECK (nps BETWEEN 0 AND 10),
  satisfaction integer CHECK (satisfaction BETWEEN 1 AND 5),
  answers jsonb NOT NULL
);
--> statement-breakpoint
REVOKE ALL ON bandarlog_api.product_survey_delivery,bandarlog_api.product_survey_response FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.product_survey(p_id uuid,p_action text,p_answers jsonb,p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  scoped_group text := bandarlog_api.current_group();
  actor text := coalesce(bandarlog_api.actor_id(),
    CASE WHEN current_setting('role',true)='bandarlog_group_app' THEN nullif(current_setting('bandarlog.survey_actor',true),'') END);
  epoch timestamptz;
  elapsed integer;
  kind text;
  cycle integer;
  validity integer;
  entry bandarlog_api.product_survey_delivery;
  sus_score numeric;
BEGIN
  IF NOT EXISTS (SELECT FROM public.users WHERE (group_id,id)=(scoped_group,actor) AND disabled_at IS NULL)
  THEN RETURN NULL; END IF;

  IF p_action='offer' THEN
    SELECT created_at INTO epoch FROM public.scout_groups WHERE id=scoped_group AND plan<>'audit-archived';
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
    ELSE RETURN NULL;
    END IF;
    IF NOT EXISTS (SELECT FROM bandarlog_api.product_campaign_control WHERE campaign=kind AND NOT paused)
      THEN RETURN NULL; END IF;
    INSERT INTO bandarlog_api.product_survey_delivery(group_id,user_id,campaign,round,expires_at)
    VALUES(scoped_group,actor,kind,cycle,epoch+validity*interval '24 hours')
    ON CONFLICT(group_id,user_id,campaign,round) DO NOTHING;
    SELECT * INTO entry FROM bandarlog_api.product_survey_delivery
    WHERE (group_id,user_id,campaign,round)=(scoped_group,actor,kind,cycle)
      AND submitted_at IS NULL AND dismissed_at IS NULL AND expires_at>statement_timestamp()
      AND (postponed_until IS NULL OR postponed_until<=statement_timestamp());
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('id',entry.id,'campaign',entry.campaign,'version',entry.version);
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
    INSERT INTO bandarlog_api.product_survey_response(campaign,version,sus,nps,satisfaction,answers)
    VALUES(entry.campaign,entry.version,sus_score,
      CASE WHEN entry.campaign='F03' THEN (p_answers->>'nps')::integer END,
      CASE WHEN entry.campaign='F03' THEN (p_answers->'scores'->>5)::integer END,p_answers);
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
CREATE FUNCTION bandarlog_api.queue_product_survey_followups()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE queued integer;
BEGIN
  WITH eligible AS (
    SELECT d.id,d.group_id,u.email FROM bandarlog_api.product_survey_delivery d
    JOIN public.users u ON (u.group_id,u.id)=(d.group_id,d.user_id)
    JOIN bandarlog_api.product_campaign_control c ON c.campaign=d.campaign AND NOT c.paused
    JOIN public.scout_groups g ON g.id=d.group_id AND g.plan<>'audit-archived'
    WHERE d.offered_at<=statement_timestamp()-interval '72 hours'
      AND d.expires_at>statement_timestamp()+interval '24 hours'
      AND d.reminded_at IS NULL AND d.dismissed_at IS NULL AND d.submitted_at IS NULL
      AND (d.postponed_until IS NULL OR d.postponed_until<=statement_timestamp())
      AND u.disabled_at IS NULL AND coalesce(u.preferences::jsonb->'notifications','true'::jsonb)='true'::jsonb
    ORDER BY d.offered_at,d.id LIMIT 100 FOR UPDATE OF d SKIP LOCKED
  ), marked AS (
    UPDATE bandarlog_api.product_survey_delivery d SET reminded_at=statement_timestamp()
    FROM eligible e WHERE d.id=e.id RETURNING d.id,d.group_id,e.email
  )
  INSERT INTO public.notifications(group_id,id,dedupe,email,subject,body,html,status,created_at)
  SELECT group_id,'product-survey-'||id,'product-survey-'||id,email,'Encuesta de Bandarlog',
    'product-survey-reminder-v1:','','pending_v2',statement_timestamp()
  FROM marked ON CONFLICT(dedupe) DO NOTHING;
  GET DIAGNOSTICS queued=ROW_COUNT;
  RETURN queued;
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.product_survey_mail_allowed(p_notification text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS (
    SELECT FROM bandarlog_api.product_survey_delivery d
    JOIN public.users u ON (u.group_id,u.id)=(d.group_id,d.user_id)
    JOIN bandarlog_api.product_campaign_control c ON c.campaign=d.campaign AND NOT c.paused
    JOIN public.notifications n ON (n.group_id,n.id)=(d.group_id,p_notification) AND n.email=u.email
    WHERE 'product-survey-'||d.id=p_notification AND d.group_id=bandarlog_api.current_group()
      AND d.submitted_at IS NULL AND d.dismissed_at IS NULL AND d.expires_at>statement_timestamp()
      AND (d.postponed_until IS NULL OR d.postponed_until<=statement_timestamp())
      AND u.disabled_at IS NULL AND coalesce(u.preferences::jsonb->'notifications','true'::jsonb)='true'::jsonb
  )
$$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.product_campaign_set_paused(p_token text,p_csrf text,p_campaign text,p_paused boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;
BEGIN
  IF p_csrf IS NULL THEN RAISE EXCEPTION 'csrf required' USING ERRCODE='42501'; END IF;
  actor := bandarlog_api.platform_admin_actor(p_token,p_csrf);
  UPDATE bandarlog_api.product_campaign_control SET paused=p_paused
  WHERE campaign=p_campaign AND paused IS DISTINCT FROM p_paused;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO bandarlog_api.platform_audit(admin_id,action,target)
  VALUES(actor->>'id',CASE WHEN p_paused THEN 'campaign.pause' ELSE 'campaign.resume' END,p_campaign);
  RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.product_campaign_status(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM bandarlog_api.platform_admin_actor(p_token);
  RETURN (SELECT jsonb_agg(to_jsonb(c) ORDER BY campaign) FROM bandarlog_api.product_campaign_control c);
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.product_survey_insights(p_token text,p_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE since timestamptz := statement_timestamp()-make_interval(days=>CASE WHEN p_days=30 THEN 30 ELSE 7 END);
BEGIN
  PERFORM bandarlog_api.platform_admin_actor(p_token);
  RETURN (
    WITH participation AS (
      SELECT campaign,version,count(*) AS invited,count(DISTINCT group_id) AS invited_groups,
        count(*) FILTER (WHERE submitted_at IS NOT NULL) AS completed,
        count(DISTINCT group_id) FILTER (WHERE submitted_at IS NOT NULL) AS participating_groups,
        count(*) FILTER (WHERE dismissed_at IS NOT NULL) AS dismissed
      FROM bandarlog_api.product_survey_delivery WHERE offered_at>=since GROUP BY 1,2
    ), scores AS (
      SELECT campaign,version,count(*) AS sample,
        CASE WHEN count(sus)>=5 THEN round(avg(sus),1) END AS sus,
        CASE WHEN count(nps)>=5 THEN round(100.0*(count(*) FILTER (WHERE nps>=9)-count(*) FILTER (WHERE nps<=6))/count(nps),1) END AS nps,
        CASE WHEN count(satisfaction)>=5 THEN round(avg(satisfaction),1) END AS satisfaction
      FROM bandarlog_api.product_survey_response WHERE submitted_at>=since GROUP BY 1,2
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'campaign',coalesce(p.campaign,s.campaign),'version',coalesce(p.version,s.version),
      'invited',coalesce(p.invited,0),'invitedGroups',coalesce(p.invited_groups,0),
      'completed',coalesce(p.completed,0),'participatingGroups',coalesce(p.participating_groups,0),
      'dismissed',coalesce(p.dismissed,0),'sample',coalesce(s.sample,0),
      'sus',s.sus,'nps',s.nps,'satisfaction',s.satisfaction
    ) ORDER BY coalesce(p.campaign,s.campaign),coalesce(p.version,s.version)),'[]'::jsonb)
    FROM participation p FULL JOIN scores s USING(campaign,version)
  );
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.product_survey(uuid,text,jsonb,text),
  bandarlog_api.queue_product_survey_followups(),bandarlog_api.product_survey_insights(text,integer),
  bandarlog_api.product_campaign_set_paused(text,text,text,boolean),
  bandarlog_api.product_campaign_status(text),bandarlog_api.product_survey_mail_allowed(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.product_survey(uuid,text,jsonb,text) TO bandarlog_user_app,bandarlog_group_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.queue_product_survey_followups() TO bandarlog_delivery;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.product_survey_insights(text,integer),
  bandarlog_api.product_campaign_status(text),
  bandarlog_api.product_campaign_set_paused(text,text,text,boolean) TO bandarlog_identity;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.product_survey_mail_allowed(text) TO bandarlog_delivery_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 51 $$;
