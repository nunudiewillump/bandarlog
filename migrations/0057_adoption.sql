CREATE TABLE bandarlog_api.adoption_events (
  group_id text NOT NULL REFERENCES public.scout_groups(id) ON DELETE CASCADE,
  account_id text NOT NULL DEFAULT '',
  event text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT '',
  receipt text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (group_id, account_id, event, version, receipt)
);
--> statement-breakpoint
ALTER TABLE bandarlog_api.adoption_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.adoption_actor(p_user text)
RETURNS public.users LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u public.users;
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'bandarlog_group_app'
     AND p_user IS DISTINCT FROM bandarlog_api.actor_id() THEN
    RAISE EXCEPTION 'Actor inválido' USING ERRCODE='42501';
  END IF;
  SELECT * INTO u FROM public.users WHERE id=p_user AND group_id=bandarlog_api.current_group()
    AND disabled_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Actor inválido' USING ERRCODE='42501'; END IF;
  RETURN u;
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.adoption_state(p_user text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u public.users := bandarlog_api.adoption_actor(p_user);
DECLARE events jsonb;
BEGIN
  SELECT coalesce(jsonb_object_agg(event,occurred_at),'{}'::jsonb) INTO events
    FROM bandarlog_api.adoption_events WHERE group_id=u.group_id AND account_id=u.id AND version=1 AND receipt='';
  RETURN jsonb_build_object('events',events,'founder',coalesce(u.preferences::jsonb->>'foundingAdmin'='true',false),
    'management',u.role IN ('coordination','admin'),'legacyGuideDone',coalesce(u.preferences::jsonb->>'adminGuideCompleted'='true',false));
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.adoption_record(p_user text,p_action text,p_receipt uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u public.users := bandarlog_api.adoption_actor(p_user);
DECLARE founder boolean := coalesce(u.preferences::jsonb->>'foundingAdmin'='true',false);
DECLARE management boolean := u.role IN ('coordination','admin');
DECLARE eligibility text;
BEGIN
  IF u.onboarding_completed_at IS NULL OR p_action NOT IN (
    'welcome_shown','choice_prepare','choice_explore','choice_replay','preparation_shown','preparation_dismissed',
    'guide_offered','guide_started','guide_completed','guide_skipped','guide_resumed','guide_repeated'
  ) THEN RAISE EXCEPTION 'Acción inválida' USING ERRCODE='42501'; END IF;
  IF p_action IN ('welcome_shown','preparation_shown','preparation_dismissed') AND NOT founder
    OR p_action='choice_prepare' AND NOT management
    OR p_action LIKE 'guide_%' AND NOT management THEN
    RAISE EXCEPTION 'Acción fuera de alcance' USING ERRCODE='42501';
  END IF;
  IF p_action IN ('choice_prepare','choice_explore','choice_replay') AND NOT EXISTS(
    SELECT FROM public.welcome_presentation WHERE group_id=u.group_id AND user_id=u.id
      AND version=1 AND viewed_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Abre primero la bienvenida' USING ERRCODE='42501'; END IF;
  IF p_action IN ('guide_completed','guide_resumed','guide_abandoned') AND NOT EXISTS(
    SELECT FROM bandarlog_api.adoption_events WHERE group_id=u.group_id AND account_id=u.id
      AND event='guide_started'
  ) THEN RAISE EXCEPTION 'Abre primero la guía' USING ERRCODE='42501'; END IF;
  IF p_action IN ('choice_prepare','choice_explore','choice_replay') AND founder THEN
    INSERT INTO bandarlog_api.adoption_events(group_id,account_id,event,source,receipt)
      VALUES(u.group_id,u.id,'choice_log',p_action,p_receipt::text) ON CONFLICT DO NOTHING;
    IF FOUND THEN
      INSERT INTO bandarlog_api.adoption_events(group_id,account_id,event,source)
        VALUES(u.group_id,u.id,'first_choice',p_action) ON CONFLICT DO NOTHING;
    ELSIF EXISTS(SELECT FROM bandarlog_api.adoption_events WHERE group_id=u.group_id
      AND account_id=u.id AND event='choice_log' AND receipt=p_receipt::text AND source<>p_action) THEN
      RAISE EXCEPTION 'Recibo de elección ya utilizado' USING ERRCODE='22023';
    END IF;
  END IF;
  SELECT source INTO eligibility FROM bandarlog_api.adoption_events
    WHERE group_id=u.group_id AND account_id=u.id AND event='guide_eligible' AND version=1;
  INSERT INTO bandarlog_api.adoption_events(group_id,account_id,event,source)
    VALUES(u.group_id,u.id,p_action,CASE WHEN p_action LIKE 'guide_%'
      THEN coalesce(eligibility,CASE WHEN founder THEN 'founder' ELSE u.role END) ELSE u.role END)
    ON CONFLICT DO NOTHING;
  IF p_action='guide_resumed' THEN
    INSERT INTO bandarlog_api.adoption_events(group_id,account_id,event,source)
    SELECT u.group_id,u.id,'guide_abandoned',coalesce(eligibility,u.role)
    FROM bandarlog_api.adoption_events
    WHERE group_id=u.group_id AND account_id=u.id AND event='guide_started'
      AND occurred_at<clock_timestamp()-interval '1 day'
    ON CONFLICT DO NOTHING;
  END IF;
  IF p_action IN ('choice_prepare','guide_repeated','guide_resumed') THEN
    INSERT INTO bandarlog_api.adoption_events(group_id,account_id,event,source)
    VALUES(u.group_id,u.id,'guide_started',coalesce(eligibility,CASE WHEN founder THEN 'founder' ELSE u.role END))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN bandarlog_api.adoption_state(p_user);
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.adoption_group_ready(p_group text)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT FROM public.projects WHERE group_id=p_group)
    AND EXISTS(SELECT FROM public.commissions WHERE group_id=p_group AND deleted_at IS NULL)
    AND EXISTS(SELECT FROM public.users WHERE group_id=p_group AND disabled_at IS NULL OFFSET 1)
    AND EXISTS(SELECT FROM public.tasks WHERE group_id=p_group AND status='done'
      AND completed_at IS NOT NULL AND deleted_at IS NULL)
$$;
--> statement-breakpoint
-- Snapshot these existing groups without inventing an activation date.
INSERT INTO bandarlog_api.adoption_events(group_id,event)
SELECT id,'historical_activation' FROM public.scout_groups WHERE bandarlog_api.adoption_group_ready(id);
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.observe_adoption()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE event_name text;
DECLARE source_name text;
DECLARE active_count bigint;
BEGIN
  IF TG_TABLE_NAME='users' THEN
    IF TG_OP='INSERT' THEN
      INSERT INTO bandarlog_api.adoption_events(group_id,account_id,event,source)
      VALUES(NEW.group_id,NEW.id,'account_added',NEW.role) ON CONFLICT DO NOTHING;
      IF coalesce(NEW.preferences::jsonb->>'foundingAdmin'='true',false) THEN
        INSERT INTO bandarlog_api.adoption_events(group_id,account_id,event,source)
        VALUES(NEW.group_id,NEW.id,'welcome_eligible','founder') ON CONFLICT DO NOTHING;
      END IF;
    END IF;
    IF NEW.role='member' AND (TG_OP='INSERT' OR OLD.role<>'member') THEN
      INSERT INTO bandarlog_api.adoption_events(group_id,account_id,event,source)
        VALUES(NEW.group_id,NEW.id,'mission_eligible','member') ON CONFLICT DO NOTHING;
    END IF;
    IF NEW.role IN ('admin','coordination') AND
       (TG_OP='INSERT' OR OLD.role NOT IN ('admin','coordination')) THEN
      source_name := CASE WHEN NEW.preferences::jsonb->>'foundingAdmin'='true' THEN 'founder'
        WHEN NEW.role='coordination' THEN 'coordination' ELSE 'admin' END;
      INSERT INTO bandarlog_api.adoption_events(group_id,account_id,event,source)
        VALUES(NEW.group_id,NEW.id,'guide_eligible',source_name) ON CONFLICT DO NOTHING;
    END IF;
    IF TG_OP='UPDATE' AND NEW.disabled_at IS NOT DISTINCT FROM OLD.disabled_at THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME='scout_groups' THEN
    INSERT INTO bandarlog_api.adoption_events(group_id,event) VALUES(NEW.id,'group_created') ON CONFLICT DO NOTHING;
    RETURN NEW;
  ELSIF TG_TABLE_NAME='projects' THEN event_name := 'project';
  ELSIF TG_TABLE_NAME='commissions' THEN event_name := 'commission';
  ELSIF TG_TABLE_NAME='invitations' THEN event_name := 'invitation';
  ELSIF TG_TABLE_NAME='assignments' THEN event_name := 'assignment';
  ELSIF TG_TABLE_NAME='tasks' THEN
    IF TG_OP='INSERT' THEN event_name := 'task';
    ELSIF NEW.status='done' AND OLD.status<>'done' AND NEW.completed_at IS NOT NULL THEN
      event_name := 'task_completed';
    ELSE RETURN NEW;
    END IF;
  END IF;
  IF event_name IS NOT NULL THEN
    INSERT INTO bandarlog_api.adoption_events(group_id,event)
      VALUES(NEW.group_id,event_name) ON CONFLICT DO NOTHING;
  END IF;
  IF (TG_TABLE_NAME='users' OR event_name IN ('project','commission','task_completed'))
    AND NOT EXISTS(SELECT FROM bandarlog_api.adoption_events WHERE group_id=NEW.group_id AND account_id='' AND event IN ('activated','historical_activation')) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.group_id,5702));
    SELECT count(*) INTO active_count FROM public.users WHERE group_id=NEW.group_id AND disabled_at IS NULL;
    IF active_count>=2 THEN
      INSERT INTO bandarlog_api.adoption_events(group_id,event) VALUES(NEW.group_id,'member_added')
      ON CONFLICT DO NOTHING;
    END IF;
    -- Activation is reached once: real project, commission, two active accounts and a completed task.
    IF active_count>=2 AND bandarlog_api.adoption_group_ready(NEW.group_id) THEN
      INSERT INTO bandarlog_api.adoption_events(group_id,event) VALUES(NEW.group_id,'activated')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER adoption_users AFTER INSERT OR UPDATE OF role,disabled_at ON public.users
FOR EACH ROW EXECUTE FUNCTION bandarlog_api.observe_adoption();
--> statement-breakpoint
CREATE TRIGGER adoption_new_group AFTER INSERT ON public.scout_groups FOR EACH ROW EXECUTE FUNCTION bandarlog_api.observe_adoption();
--> statement-breakpoint
CREATE TRIGGER adoption_projects AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION bandarlog_api.observe_adoption();
--> statement-breakpoint
CREATE TRIGGER adoption_commissions AFTER INSERT ON public.commissions FOR EACH ROW EXECUTE FUNCTION bandarlog_api.observe_adoption();
--> statement-breakpoint
CREATE TRIGGER adoption_invitations AFTER INSERT ON public.invitations FOR EACH ROW EXECUTE FUNCTION bandarlog_api.observe_adoption();
--> statement-breakpoint
CREATE TRIGGER adoption_assignments AFTER INSERT ON public.assignments FOR EACH ROW EXECUTE FUNCTION bandarlog_api.observe_adoption();
--> statement-breakpoint
CREATE TRIGGER adoption_tasks AFTER INSERT OR UPDATE OF status ON public.tasks FOR EACH ROW EXECUTE FUNCTION bandarlog_api.observe_adoption();
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.adoption_actor(text),bandarlog_api.adoption_state(text),
  bandarlog_api.adoption_record(text,text,uuid),bandarlog_api.adoption_group_ready(text),bandarlog_api.observe_adoption() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.adoption_state(text),bandarlog_api.adoption_record(text,text,uuid)
TO bandarlog_user_app,bandarlog_group_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 57 $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.adoption_insights(p_token text,p_days integer,p_role text,p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM bandarlog_api.platform_admin_actor(p_token);
  RETURN (
    WITH groups AS MATERIALIZED (
      SELECT id,created_at FROM public.scout_groups
      WHERE p_days=0 OR created_at >= statement_timestamp()-make_interval(days=>p_days)
    ), events AS MATERIALIZED (
      SELECT e.* FROM bandarlog_api.adoption_events e JOIN groups g ON g.id=e.group_id
    ), per_group AS (
      SELECT g.id,g.created_at,
        min(e.occurred_at) FILTER(WHERE e.event='guide_started') AS guide,
        min(e.occurred_at) FILTER(WHERE e.event='project') AS project,
        min(e.occurred_at) FILTER(WHERE e.event='member_added') AS member,
        min(e.occurred_at) FILTER(WHERE e.event='task_completed') AS task,
        min(e.occurred_at) FILTER(WHERE e.event='activated') AS activated,
        coalesce(bool_or(e.event='group_created'),false) AS tracked
      FROM groups g LEFT JOIN events e ON e.group_id=g.id GROUP BY g.id,g.created_at
    ), history AS (
      SELECT group_id AS id FROM events WHERE account_id='' AND event='historical_activation'
    ), founder AS (
      SELECT g.id,w.completed_at,w.reopened_at, f.choices, f.first_choice,
        f.prepared,f.explored,f.replayed,f.prepare_choices,f.explore_choices,f.replay_choices
      FROM groups g JOIN public.users u ON u.group_id=g.id
        AND u.preferences::jsonb->>'foundingAdmin'='true'
      LEFT JOIN public.welcome_presentation w ON w.group_id=g.id AND w.user_id=u.id AND w.version=p_version
      LEFT JOIN LATERAL (
        SELECT max(source) FILTER(WHERE event='first_choice') AS first_choice,
          greatest(count(*) FILTER(WHERE event='choice_log')-1,0) AS choices,
          count(*) FILTER(WHERE event='choice_log' AND source='choice_prepare') AS prepare_choices,
          count(*) FILTER(WHERE event='choice_log' AND source='choice_explore') AS explore_choices,
          count(*) FILTER(WHERE event='choice_log' AND source='choice_replay') AS replay_choices,
          bool_or(event='choice_prepare') AS prepared,
          bool_or(event='choice_explore') AS explored,
          bool_or(event='choice_replay') AS replayed
        FROM events WHERE group_id=g.id AND account_id=u.id
      ) f ON true
    ), tutorial_people AS (
      SELECT u.id,u.group_id,u.role,u.preferences::jsonb->>'adminGuideCompleted'='true' AS historical_guide,
        coalesce(e.events,'{}'::jsonb) AS e,w.viewed_at,w.completed_at,w.skipped_at,w.reopened_at,
        coalesce(t.events,'{}'::jsonb) AS t
      FROM groups g JOIN public.users u ON u.group_id=g.id
      LEFT JOIN public.welcome_presentation w ON w.group_id=g.id AND w.user_id=u.id AND w.version=p_version
      LEFT JOIN public.tutorial_progress t ON t.group_id=g.id AND t.user_id=u.id AND p_version=1
      LEFT JOIN LATERAL (
        SELECT jsonb_object_agg(event,occurred_at) AS events FROM events
          WHERE group_id=g.id AND account_id=u.id AND version=p_version AND receipt=''
      ) e ON true
      WHERE p_role='' OR u.role=p_role
    ), experience AS (
      SELECT v.* FROM tutorial_people p CROSS JOIN LATERAL (VALUES
        ('welcome',p.e?'welcome_eligible',p.e?'welcome_shown' OR p.viewed_at IS NOT NULL,p.viewed_at,
          p.completed_at,p.skipped_at,p.reopened_at,
          p.viewed_at IS NOT NULL AND p.completed_at IS NULL AND p.skipped_at IS NULL AND p.viewed_at<statement_timestamp()-interval '1 day',false),
        ('guide',p.e?'guide_eligible',p.e?'guide_offered' OR p.e?'guide_started',(p.e->>'guide_started')::timestamptz,
          (p.e->>'guide_completed')::timestamptz,(p.e->>'guide_skipped')::timestamptz,
          (coalesce(p.e->>'guide_resumed',p.e->>'guide_repeated'))::timestamptz,
          p.e?'guide_abandoned' OR (p.e?'guide_started' AND NOT (p.e?'guide_completed' OR p.e?'guide_skipped')
            AND coalesce(p.e->>'guide_resumed',p.e->>'guide_started')::timestamptz<statement_timestamp()-interval '1 day'),
          coalesce(p.historical_guide,false)),
        ('mission',p.e?'mission_eligible',p.t?'tutorial_shown',(p.t->>'tutorial_started')::timestamptz,
          (p.t->>'tutorial_completed')::timestamptz,(p.t->>'tutorial_skipped')::timestamptz,
          (p.t->>'tutorial_reopened')::timestamptz,p.t?'tutorial_abandoned',false)
      ) v(name,eligible,shown,started,completed,skipped,reopened,abandoned,historical)
    ), stage AS (
      SELECT p.*,f.completed_at,f.reopened_at,f.choices,f.first_choice,f.prepared,f.explored,f.replayed,f.prepare_choices,f.explore_choices,f.replay_choices,
        h.id IS NOT NULL AS historical_activation FROM per_group p LEFT JOIN founder f USING(id) LEFT JOIN history h USING(id)
    )
    SELECT jsonb_build_object(
      'summary',(SELECT jsonb_build_object('groups',count(*),'welcomeCompleted',count(completed_at),
        'prepared',count(*) FILTER(WHERE prepared),'explored',count(*) FILTER(WHERE explored),
        'replayed',count(*) FILTER(WHERE replayed OR reopened_at IS NOT NULL),'guideStarted',count(guide),
        'activated',count(*) FILTER(WHERE activated IS NOT NULL OR historical_activation),
        'historicalActivated',count(*) FILTER(WHERE historical_activation),'tracked',count(*) FILTER(WHERE tracked),'medianDays',percentile_cont(.5) WITHIN GROUP
          (ORDER BY extract(epoch FROM activated-created_at)/86400)) FROM stage),
      'funnel',(SELECT jsonb_build_array(count(*),count(completed_at),
        count(*) FILTER(WHERE guide>=completed_at),
        count(*) FILTER(WHERE guide>=completed_at AND project>=guide),
        count(*) FILTER(WHERE guide>=completed_at AND project>=guide AND member>=project),
        count(*) FILTER(WHERE guide>=completed_at AND project>=guide AND member>=project AND task>=member),
        count(*) FILTER(WHERE guide>=completed_at AND project>=guide AND member>=project AND task>=member AND activated>=task)
      ) FROM stage),
      'intent',(SELECT jsonb_build_object('prepare',count(*) FILTER(WHERE first_choice='choice_prepare'),
        'explore',count(*) FILTER(WHERE first_choice='choice_explore'),'replay',count(*) FILTER(WHERE first_choice='choice_replay'),
        'unknown',count(*) FILTER(WHERE first_choice IS NULL),'later',coalesce(sum(choices),0),
        'laterPrepare',coalesce(sum(prepare_choices),0)-count(*) FILTER(WHERE first_choice='choice_prepare'),
        'laterExplore',coalesce(sum(explore_choices),0)-count(*) FILTER(WHERE first_choice='choice_explore'),
        'laterReplay',coalesce(sum(replay_choices),0)-count(*) FILTER(WHERE first_choice='choice_replay'),
        'explorersPrepared',count(*) FILTER(WHERE first_choice='choice_explore' AND prepared),
        'explorersActivated',count(*) FILTER(WHERE first_choice='choice_explore' AND (activated IS NOT NULL OR historical_activation))) FROM stage),
      'cohorts',(SELECT jsonb_agg(row_to_json(c) ORDER BY days) FROM (
        SELECT days,count(*) FILTER(WHERE tracked AND created_at<=statement_timestamp()-make_interval(days=>days)) AS eligible,
          count(*) FILTER(WHERE tracked AND created_at<=statement_timestamp()-make_interval(days=>days)
            AND activated<=created_at+make_interval(days=>days)) AS activated
        FROM (VALUES(7),(14),(30)) windows(days) LEFT JOIN per_group ON true GROUP BY days
      ) c),
      'experiences',(SELECT coalesce(jsonb_object_agg(name,to_jsonb(x)-'name'),'{}'::jsonb) FROM (
        SELECT name,count(*) FILTER(WHERE eligible) AS eligible,count(*) FILTER(WHERE shown) AS shown,
          count(started) AS started,count(completed) AS completed,count(skipped) AS skipped,
          count(reopened) AS reopened,count(*) FILTER(WHERE abandoned) AS abandoned,
          count(*) FILTER(WHERE historical) AS historical,
          count(*) FILTER(WHERE shown AND started IS NOT NULL) AS "startedAmongShown",
          count(*) FILTER(WHERE started IS NOT NULL AND completed IS NOT NULL) AS "completedAmongStarted",
          percentile_cont(.5) WITHIN GROUP(ORDER BY extract(epoch FROM completed-started)/60)
            FILTER(WHERE completed>=started) AS "medianMinutes"
        FROM experience GROUP BY name
      ) x),
      'eligibilitySources',(SELECT coalesce(jsonb_object_agg(source,n),'{}'::jsonb) FROM (
        SELECT source,count(*) AS n FROM events WHERE event='guide_eligible' AND version=p_version GROUP BY source
      ) x),
      'milestones',(SELECT coalesce(jsonb_object_agg(event,n),'{}'::jsonb) FROM (
        SELECT event,count(*) AS n FROM events WHERE account_id='' GROUP BY event
      ) x)
    )
  );
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.adoption_insights(text,integer,text,integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.adoption_insights(text,integer,text,integer) TO bandarlog_identity;
