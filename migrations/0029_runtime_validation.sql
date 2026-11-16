CREATE FUNCTION bandarlog_api.valid_checklist(p_value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN jsonb_typeof(p_value)<>'array' THEN false ELSE jsonb_array_length(p_value)<=100 AND NOT EXISTS(SELECT FROM jsonb_array_elements(p_value) x WHERE jsonb_typeof(x)<>'object' OR jsonb_typeof(x->'id') IS DISTINCT FROM 'string' OR (x->>'id') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' OR jsonb_typeof(x->'title') IS DISTINCT FROM 'string' OR length(trim(x->>'title')) NOT BETWEEN 1 AND 240 OR jsonb_typeof(x->'done') IS DISTINCT FROM 'boolean' OR x-ARRAY['id','title','done']<>'{}'::jsonb) AND (SELECT count(*)=count(DISTINCT x->>'id') FROM jsonb_array_elements(p_value) x) END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.valid_checklist(jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.valid_checklist(jsonb) TO bandarlog_user_app;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.validate_runtime_row() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ DECLARE row jsonb:=to_jsonb(NEW); BEGIN
 IF current_user<>'bandarlog_user_app' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='tasks' THEN
  IF length(trim(row->>'title')) NOT BETWEEN 1 AND 200 OR length(row->>'description')>5000 OR coalesce(length(row->>'blocked_reason'),0)>1000 OR NOT bandarlog_api.valid_checklist(row->'checklist') THEN RAISE EXCEPTION 'invalid task fields' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='members' THEN
  IF row->>'role' NOT IN ('responsible','scouter') THEN RAISE EXCEPTION 'invalid membership role' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='users' THEN
  IF length(trim(row->>'name')) NOT BETWEEN 1 AND 200 OR length(row->>'preferences')>4096 OR jsonb_typeof((row->>'preferences')::jsonb)<>'object' THEN RAISE EXCEPTION 'invalid profile' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='invitations' THEN
  IF row->>'role' NOT IN ('responsible','scouter') OR row->>'status' NOT IN ('pending','accepted','revoked','expired') OR (row->>'expires')::timestamptz>statement_timestamp()+interval '7 days 1 minute' THEN RAISE EXCEPTION 'invalid invitation fields' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.validate_runtime_row() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER validate_runtime_row BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION bandarlog_api.validate_runtime_row();
--> statement-breakpoint
CREATE TRIGGER validate_runtime_row BEFORE INSERT OR UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION bandarlog_api.validate_runtime_row();
--> statement-breakpoint
CREATE TRIGGER validate_runtime_row BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION bandarlog_api.validate_runtime_row();
--> statement-breakpoint
CREATE TRIGGER validate_runtime_row BEFORE INSERT OR UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION bandarlog_api.validate_runtime_row();
