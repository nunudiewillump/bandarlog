CREATE TABLE bandarlog_api.platform_metrics_configuration(id boolean PRIMARY KEY CHECK(id),started_at timestamptz);
--> statement-breakpoint

INSERT INTO bandarlog_api.platform_metrics_configuration(id) VALUES(true);
--> statement-breakpoint

CREATE TABLE bandarlog_api.platform_presence(group_id text NOT NULL,user_id text NOT NULL,day date NOT NULL,PRIMARY KEY(group_id,user_id,day));
--> statement-breakpoint

CREATE INDEX platform_presence_days ON bandarlog_api.platform_presence(day,group_id,user_id);
--> statement-breakpoint

CREATE TABLE bandarlog_api.platform_logins(id text PRIMARY KEY,group_id text NOT NULL,user_id text NOT NULL,method text NOT NULL,at timestamptz NOT NULL DEFAULT statement_timestamp());
--> statement-breakpoint

CREATE INDEX platform_logins_time ON bandarlog_api.platform_logins(at,group_id);
--> statement-breakpoint

ALTER TABLE public.activity ADD COLUMN completed_transition boolean NOT NULL DEFAULT false;
--> statement-breakpoint

ALTER TABLE public.activity ADD COLUMN checklist_marks integer NOT NULL DEFAULT 0 CHECK(checklist_marks BETWEEN 0 AND 100);
--> statement-breakpoint

ALTER TABLE public.sessions ADD COLUMN auth_method text CHECK(auth_method IN ('email','google'));
--> statement-breakpoint

REVOKE ALL ON bandarlog_api.platform_metrics_configuration,bandarlog_api.platform_presence,bandarlog_api.platform_logins FROM PUBLIC;
--> statement-breakpoint

CREATE FUNCTION bandarlog_api.platform_admin_presence() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb; BEGIN
 a:=bandarlog_api.actor();
 BEGIN
 INSERT INTO bandarlog_api.platform_presence(group_id,user_id,day) VALUES(a->>'group',a->>'id',(statement_timestamp() AT TIME ZONE 'Europe/Madrid')::date) ON CONFLICT DO NOTHING;
 EXCEPTION WHEN OTHERS THEN RETURN false; END;
 RETURN true;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION bandarlog_api.platform_admin_presence() FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION bandarlog_api.platform_admin_presence() TO bandarlog_user_app;
--> statement-breakpoint

CREATE FUNCTION bandarlog_api.platform_admin_login_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k text;
BEGIN
 IF session_user<>'bandarlog_identity' THEN RETURN NEW; END IF;
 IF NEW.auth_method IS NOT NULL THEN
  SELECT secret INTO k FROM bandarlog_api.context_key WHERE id;
  IF k IS NULL OR current_setting('bandarlog.metric_proof',true) IS DISTINCT FROM bandarlog_api.context_hmac('session_metric'||E'\n'||NEW.group_id||E'\n'||txid_current()::text||E'\n'||NEW.id||E'\n'||NEW.auth_method,k)
  THEN RAISE EXCEPTION 'invalid login metric authority' USING ERRCODE='42501'; END IF;
 END IF;
 INSERT INTO bandarlog_api.platform_logins(id,group_id,user_id,method) VALUES(NEW.id,NEW.group_id,NEW.user_id,coalesce(NEW.auth_method,CASE WHEN NEW.assurance='activation' THEN 'activation' ELSE 'unknown' END));
 RETURN NEW;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION bandarlog_api.platform_admin_login_event() FROM PUBLIC;
--> statement-breakpoint

CREATE TRIGGER platform_login_event AFTER INSERT ON public.sessions FOR EACH ROW EXECUTE FUNCTION bandarlog_api.platform_admin_login_event();
--> statement-breakpoint

-- Bounded metadata, never texts, IPs, or per-request page tracking.
CREATE FUNCTION bandarlog_api.platform_admin_usage(p_days integer,p_group text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE today date:=(statement_timestamp() AT TIME ZONE 'Europe/Madrid')::date;
 since date; previous date; start_at timestamptz; presence jsonb; actions jsonb; projects jsonb;
BEGIN
 IF p_days IS NULL OR p_days NOT IN (7,30) THEN RAISE EXCEPTION 'invalid period' USING ERRCODE='22023'; END IF;
 since:=today-(p_days-1);previous:=since-p_days;
 SELECT started_at INTO start_at FROM bandarlog_api.platform_metrics_configuration WHERE id;
 WITH eligible AS(SELECT u.group_id,u.id FROM public.users u JOIN public.scout_groups g ON g.id=u.group_id WHERE u.disabled_at IS NULL AND g.plan<>'audit-archived' AND (p_group IS NULL OR g.id=p_group)),
 days AS(SELECT p.* FROM bandarlog_api.platform_presence p JOIN eligible e ON (e.group_id,e.id)=(p.group_id,p.user_id) WHERE p.day>=least(previous,today-29)),
 counts AS(SELECT group_id,user_id,count(*) FILTER(WHERE day>=since) n,bool_or(day>=since) current,bool_or(day>=previous AND day<since) prior FROM days GROUP BY group_id,user_id)
 SELECT jsonb_build_object('active',count(*) FILTER(WHERE current),'previous',count(*) FILTER(WHERE prior),'returning',count(*) FILTER(WHERE current AND prior),'recurring',count(*) FILTER(WHERE n>=2),'activeGroups',count(DISTINCT group_id) FILTER(WHERE current),'days',coalesce(sum(n),0),
 'daily',(SELECT count(DISTINCT(group_id,user_id)) FROM days WHERE day=today),
 'weekly',(SELECT count(DISTINCT(group_id,user_id)) FROM days WHERE day>=today-6),
 'monthly',(SELECT count(DISTINCT(group_id,user_id)) FROM days WHERE day>=today-29)) INTO presence FROM counts;
 WITH events AS(SELECT a.group_id,a.user_id,a.kind,a.completed_transition,a.checklist_marks FROM public.activity a JOIN public.users u ON (u.group_id,u.id)=(a.group_id,a.user_id) JOIN public.scout_groups g ON g.id=a.group_id
 WHERE a.created_at >= (since::timestamp AT TIME ZONE 'Europe/Madrid') AND u.disabled_at IS NULL AND g.plan<>'audit-archived' AND (p_group IS NULL OR g.id=p_group))
 SELECT jsonb_build_object('created',count(*) FILTER(WHERE kind='created'),'createdUsers',count(DISTINCT(group_id,user_id)) FILTER(WHERE kind='created'),
 'updated',count(*) FILTER(WHERE kind='updated'),'updatedUsers',count(DISTINCT(group_id,user_id)) FILTER(WHERE kind='updated'),
 'done',count(*) FILTER(WHERE completed_transition),'doneUsers',count(DISTINCT(group_id,user_id)) FILTER(WHERE completed_transition),
 'comments',count(*) FILTER(WHERE kind='comment'),'commentUsers',count(DISTINCT(group_id,user_id)) FILTER(WHERE kind='comment'),
 'checklist',coalesce(sum(checklist_marks),0),'checklistUsers',count(DISTINCT(group_id,user_id)) FILTER(WHERE checklist_marks>0),
 'contributors',count(DISTINCT(group_id,user_id)) FILTER(WHERE kind IN ('created','updated','comment'))) INTO actions FROM events;
 SELECT jsonb_build_object('projects',count(*),'activeProjects',count(*) FILTER(WHERE EXISTS(SELECT FROM public.commissions c JOIN public.tasks t ON (t.group_id,t.commission_id)=(c.group_id,c.id) JOIN public.activity a ON (a.group_id,a.task_id)=(t.group_id,t.id) WHERE c.project_id=p.id AND c.group_id=p.group_id AND a.created_at>=(since::timestamp AT TIME ZONE 'Europe/Madrid') AND a.kind IN ('created','updated','comment')))) INTO projects
 FROM public.projects p JOIN public.scout_groups g ON g.id=p.group_id WHERE p.archived='false' AND g.plan<>'audit-archived' AND (p_group IS NULL OR g.id=p_group);
 RETURN presence||actions||projects||jsonb_build_object('members',(SELECT count(*) FROM public.users u JOIN public.scout_groups g ON g.id=u.group_id WHERE u.disabled_at IS NULL AND g.plan<>'audit-archived' AND (p_group IS NULL OR g.id=p_group)),
 'coverage',jsonb_build_object('since',start_at,'current',start_at IS NOT NULL AND start_at <= (since::timestamp AT TIME ZONE 'Europe/Madrid'),'previous',start_at IS NOT NULL AND start_at <= (previous::timestamp AT TIME ZONE 'Europe/Madrid'),
 'daily',start_at IS NOT NULL AND start_at <= (today::timestamp AT TIME ZONE 'Europe/Madrid'),'weekly',start_at IS NOT NULL AND start_at <= ((today-6)::timestamp AT TIME ZONE 'Europe/Madrid'),'monthly',start_at IS NOT NULL AND start_at <= ((today-29)::timestamp AT TIME ZONE 'Europe/Madrid')));
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION bandarlog_api.platform_admin_usage(integer,text) FROM PUBLIC;
--> statement-breakpoint

CREATE FUNCTION bandarlog_api.platform_admin_read(p_token text,p_view text,p_days integer,p_cursor text,p_limit integer,p_filter text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a jsonb; result jsonb; items jsonb; total integer; next_cursor text;
BEGIN
 a:=bandarlog_api.platform_admin_actor(p_token);
 IF p_days IS NULL OR p_days NOT IN (7,30) OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_filter IS NULL OR p_cursor IS NULL OR length(p_filter)>100 OR length(p_cursor)>100 THEN RAISE EXCEPTION 'invalid query' USING ERRCODE='22023'; END IF;
 IF p_view IN ('overview','metrics') THEN
  result:=bandarlog_api.platform_admin_usage(p_days);
  RETURN jsonb_build_object('at',statement_timestamp(),'usage',result,'groups',bandarlog_api.platform_admin_group_rows(p_days,'',25,''),'series',CASE WHEN p_view='metrics' THEN bandarlog_api.platform_admin_series(p_days) ELSE '[]'::jsonb END,'stock',jsonb_build_object(
   'groups',(SELECT count(*) FROM public.scout_groups WHERE plan<>'audit-archived'),
   'pendingRequests',(SELECT count(*) FROM public.group_registrations WHERE approved_at IS NULL AND rejected_at IS NULL AND consumed_at IS NULL AND expires>statement_timestamp()),
   'mailFailed',(SELECT count(*) FROM public.notifications WHERE status NOT IN ('sent','cancelled','preview') AND attempts::integer>=5)+(SELECT count(*) FROM public.platform_mail WHERE status NOT IN ('sent','cancelled','preview') AND attempts::integer>=5),
   'mailPending',(SELECT count(*) FROM public.notifications WHERE status IN ('pending','pending_v2','sending'))+(SELECT count(*) FROM public.platform_mail WHERE status IN ('pending','pending_v2','sending'))));
 ELSIF p_view='groups' THEN
  items:=bandarlog_api.platform_admin_group_rows(p_days,p_cursor,p_limit+1,p_filter);
 ELSIF p_view='group' THEN
  RETURN (SELECT jsonb_build_object('id',g.id,'name',g.name,'createdAt',g.created_at,'plan',g.plan,'usage',bandarlog_api.platform_admin_usage(p_days,g.id)) FROM public.scout_groups g WHERE g.id=p_filter AND g.plan<>'audit-archived');
 ELSIF p_view='requests' THEN
  WITH all_rows AS(SELECT id,group_name,name,created_at,expires,approved_at,rejected_at,consumed_at,
   CASE WHEN consumed_at IS NOT NULL THEN 'activated' WHEN rejected_at IS NOT NULL THEN 'rejected' WHEN expires<=statement_timestamp() THEN 'expired' WHEN approved_at IS NOT NULL THEN 'approved' ELSE 'pending' END status
   FROM public.group_registrations), rows AS(SELECT * FROM all_rows WHERE id>p_cursor AND (p_filter='' OR status=p_filter) ORDER BY id LIMIT p_limit+1)
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb) INTO items FROM rows r;
 ELSIF p_view='access' THEN
  RETURN jsonb_build_object('methods',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT method,count(*) count FROM bandarlog_api.platform_logins WHERE at>=(((statement_timestamp() AT TIME ZONE 'Europe/Madrid')::date-(p_days-1))::timestamp AT TIME ZONE 'Europe/Madrid') GROUP BY method)x),'[]'::jsonb),
   'rejected',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT method,sum(count)::bigint count FROM bandarlog_api.platform_denials WHERE day>=(statement_timestamp() AT TIME ZONE 'Europe/Madrid')::date-(p_days-1) GROUP BY method)x),'[]'::jsonb),
   'coverage',(SELECT started_at FROM bandarlog_api.platform_metrics_configuration WHERE id),
   'items',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT at,action FROM bandarlog_api.platform_audit WHERE admin_id=a->>'id' AND action LIKE 'login.%' ORDER BY id DESC LIMIT p_limit)x),'[]'::jsonb));
 ELSIF p_view='mail' THEN
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT status,sum(n)::integer count FROM(
   SELECT CASE WHEN attempts::integer>=5 AND status NOT IN ('sent','preview','cancelled') THEN 'failed' WHEN status='pending_v2' THEN 'pending' ELSE status END status,count(*) n FROM public.notifications GROUP BY 1 UNION ALL SELECT CASE WHEN attempts::integer>=5 AND status NOT IN ('sent','preview','cancelled') THEN 'failed' WHEN status='pending_v2' THEN 'pending' ELSE status END status,count(*) n FROM public.platform_mail GROUP BY 1)y GROUP BY status)x),'[]'::jsonb));
 ELSIF p_view='audit' THEN
  WITH rows AS(SELECT x.id::text,x.at,x.action,x.target,x.reason,p.name actor FROM bandarlog_api.platform_audit x JOIN bandarlog_api.platform_admins p ON p.id=x.admin_id WHERE (p_cursor='' OR x.id<nullif(p_cursor,'')::bigint) ORDER BY x.id DESC LIMIT p_limit+1)
  SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) INTO items FROM rows r;
 ELSE RAISE EXCEPTION 'unknown view' USING ERRCODE='22023'; END IF;
 total:=jsonb_array_length(items);
 IF total>p_limit THEN items:=items-(total-1); next_cursor:=items->(p_limit-1)->>'id'; END IF;
 RETURN jsonb_build_object('items',items,'nextCursor',next_cursor,'coverage',(SELECT started_at IS NOT NULL AND started_at<=(((statement_timestamp() AT TIME ZONE 'Europe/Madrid')::date-(p_days-1))::timestamp AT TIME ZONE 'Europe/Madrid') FROM bandarlog_api.platform_metrics_configuration WHERE id));
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION bandarlog_api.platform_admin_read(text,text,integer,text,integer,text) FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION bandarlog_api.platform_admin_read(text,text,integer,text,integer,text) TO bandarlog_identity;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 40 $$;
--> statement-breakpoint


CREATE INDEX platform_activity_metadata ON public.activity(created_at,group_id,user_id) INCLUDE(kind,task_id,completed_transition,checklist_marks);
--> statement-breakpoint

CREATE FUNCTION bandarlog_api.platform_admin_prune() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 DELETE FROM bandarlog_api.platform_sessions WHERE id IN (SELECT id FROM bandarlog_api.platform_sessions WHERE expires<statement_timestamp()-interval '1 day' LIMIT 1000);
 DELETE FROM bandarlog_api.platform_oauth WHERE id IN (SELECT id FROM bandarlog_api.platform_oauth WHERE created_at<statement_timestamp()-interval '1 day' LIMIT 1000);
 DELETE FROM bandarlog_api.platform_codes WHERE email_key IN (SELECT email_key FROM bandarlog_api.platform_codes WHERE coalesce(requested_at,window_at)<statement_timestamp()-interval '1 day' LIMIT 1000);
 DELETE FROM bandarlog_api.platform_presence WHERE (group_id,user_id,day) IN (SELECT group_id,user_id,day FROM bandarlog_api.platform_presence WHERE day<(statement_timestamp() AT TIME ZONE 'Europe/Madrid')::date-90 LIMIT 1000);
 DELETE FROM bandarlog_api.platform_logins WHERE id IN (SELECT id FROM bandarlog_api.platform_logins WHERE at<statement_timestamp()-interval '90 days' LIMIT 1000);
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION bandarlog_api.platform_admin_prune() FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION bandarlog_api.platform_admin_prune() TO bandarlog_delivery;
--> statement-breakpoint


CREATE FUNCTION bandarlog_api.platform_admin_group_rows(p_days integer,p_cursor text,p_limit integer,p_filter text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH selected AS MATERIALIZED(SELECT id,name,created_at FROM public.scout_groups WHERE plan<>'audit-archived' AND id>p_cursor AND name ILIKE '%'||p_filter||'%' ORDER BY id LIMIT p_limit),
 members AS(SELECT group_id,count(*) n FROM public.users WHERE disabled_at IS NULL AND group_id IN(SELECT id FROM selected) GROUP BY group_id),
 projects AS(SELECT group_id,count(*) n FROM public.projects WHERE archived='false' AND group_id IN(SELECT id FROM selected) GROUP BY group_id),
 active AS(SELECT p.group_id,count(DISTINCT p.user_id) n FROM bandarlog_api.platform_presence p JOIN public.users u ON (u.group_id,u.id)=(p.group_id,p.user_id) WHERE p.day>=(statement_timestamp() AT TIME ZONE 'Europe/Madrid')::date-(p_days-1) AND u.disabled_at IS NULL AND p.group_id IN(SELECT id FROM selected) GROUP BY p.group_id),
 contributors AS(SELECT a.group_id,count(DISTINCT a.user_id) n FROM public.activity a JOIN public.users u ON (u.group_id,u.id)=(a.group_id,a.user_id) WHERE a.kind IN('created','updated','comment') AND a.created_at>=(((statement_timestamp() AT TIME ZONE 'Europe/Madrid')::date-(p_days-1))::timestamp AT TIME ZONE 'Europe/Madrid') AND u.disabled_at IS NULL AND a.group_id IN(SELECT id FROM selected) GROUP BY a.group_id)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'createdAt',s.created_at,'members',coalesce(m.n,0),'projects',coalesce(p.n,0),'active',coalesce(a.n,0),'contributors',coalesce(c.n,0)) ORDER BY s.id),'[]'::jsonb)
 FROM selected s LEFT JOIN members m ON m.group_id=s.id LEFT JOIN projects p ON p.group_id=s.id LEFT JOIN active a ON a.group_id=s.id LEFT JOIN contributors c ON c.group_id=s.id
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION bandarlog_api.platform_admin_group_rows(integer,text,integer,text) FROM PUBLIC;
--> statement-breakpoint

CREATE FUNCTION bandarlog_api.platform_admin_series(p_days integer) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH config AS(SELECT (statement_timestamp() AT TIME ZONE 'Europe/Madrid')::date today,started_at FROM bandarlog_api.platform_metrics_configuration WHERE id),
 ranges AS(SELECT today-(p_days-1)+i*CASE WHEN p_days=30 THEN 5 ELSE 1 END first_day,
 today-(p_days-1)+(i+1)*CASE WHEN p_days=30 THEN 5 ELSE 1 END-1 last_day,c.started_at,c.today FROM config c,generate_series(0,CASE WHEN p_days=30 THEN 5 ELSE 6 END)i),
 rows AS(SELECT r.first_day,r.last_day,r.today,CASE WHEN r.started_at IS NOT NULL AND r.started_at <= (r.first_day::timestamp AT TIME ZONE 'Europe/Madrid') THEN count(DISTINCT(p.group_id,p.user_id)) FILTER(WHERE u.id IS NOT NULL AND g.id IS NOT NULL) ELSE NULL END active
 FROM ranges r LEFT JOIN bandarlog_api.platform_presence p ON p.day BETWEEN r.first_day AND r.last_day LEFT JOIN public.users u ON (u.group_id,u.id)=(p.group_id,p.user_id) AND u.disabled_at IS NULL LEFT JOIN public.scout_groups g ON g.id=p.group_id AND g.plan<>'audit-archived' GROUP BY r.first_day,r.last_day,r.today,r.started_at)
 SELECT coalesce(jsonb_agg(jsonb_build_object('day',first_day,'end',last_day,'active',active,'partial',last_day=today) ORDER BY first_day),'[]'::jsonb) FROM rows
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION bandarlog_api.platform_admin_series(integer) FROM PUBLIC;
--> statement-breakpoint

CREATE TABLE bandarlog_api.platform_denials(day date NOT NULL,method text NOT NULL,count bigint NOT NULL,PRIMARY KEY(day,method));
--> statement-breakpoint

REVOKE ALL ON bandarlog_api.platform_denials FROM PUBLIC;
--> statement-breakpoint

CREATE FUNCTION bandarlog_api.platform_admin_denial(p_method text,p_count integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF p_method IS NULL OR p_method NOT IN ('email','google') OR p_count IS NULL OR p_count NOT BETWEEN 1 AND 1000000 THEN RAISE EXCEPTION 'invalid counter' USING ERRCODE='22023'; END IF;
 INSERT INTO bandarlog_api.platform_denials(day,method,count) VALUES((statement_timestamp() AT TIME ZONE 'Europe/Madrid')::date,p_method,p_count)
 ON CONFLICT(day,method) DO UPDATE SET count=platform_denials.count+excluded.count;
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION bandarlog_api.platform_admin_denial(text,integer) FROM PUBLIC;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION bandarlog_api.platform_admin_denial(text,integer) TO bandarlog_identity;

--> statement-breakpoint
CREATE FUNCTION bandarlog_api.platform_admin_activity_presence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF session_user='bandarlog_http' AND current_setting('role',true)='bandarlog_user_app' THEN PERFORM bandarlog_api.platform_admin_presence(); END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.platform_admin_activity_presence() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER platform_activity_presence AFTER INSERT ON public.activity FOR EACH ROW EXECUTE FUNCTION bandarlog_api.platform_admin_activity_presence();
