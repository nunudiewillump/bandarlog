DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='bandarlog_identity') THEN CREATE ROLE bandarlog_identity NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='bandarlog_delivery') THEN CREATE ROLE bandarlog_delivery NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT; END IF;
END $$;
--> statement-breakpoint
-- The identity process initially reuses the existing, signed group path. HTTP cannot assume it.
GRANT bandarlog_group_app TO bandarlog_identity,bandarlog_delivery;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public,bandarlog_api TO bandarlog_identity,bandarlog_delivery;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.resolve_group(text),bandarlog_api.oauth_group(text),bandarlog_api.entry_group(text,text,boolean),bandarlog_api.request_group(text,jsonb,jsonb),bandarlog_api.registration(text),bandarlog_api.review_group(text,text,text,jsonb),bandarlog_api.activate_group(text,text,text) TO bandarlog_identity;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.resolve_group(text),bandarlog_api.job_groups(boolean,boolean),bandarlog_api.push_keys(text,text),bandarlog_api.claim_platform_mail(),bandarlog_api.finish_platform_mail(text,jsonb),bandarlog_api.platform_next() TO bandarlog_delivery;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.public_push_key() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT public_key FROM public.push_keys WHERE id='default' $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.public_push_key() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.public_push_key() TO bandarlog_http,bandarlog_identity;
--> statement-breakpoint
-- No body/HTML of queued credentials is readable by the HTTP LOGIN.
GRANT SELECT(group_id,id,dedupe,email,subject,status,attempts,created_at,sent_at,next_attempt_at,provider_message_id) ON public.notifications TO bandarlog_user_app;
--> statement-breakpoint
GRANT INSERT ON public.notifications,public.push_outbox TO bandarlog_user_app;
--> statement-breakpoint
CREATE POLICY actor_notifications_read ON public.notifications FOR SELECT TO bandarlog_user_app USING(group_id=(SELECT bandarlog_api.current_group()) AND bandarlog_api.actor_manages());
--> statement-breakpoint
CREATE POLICY actor_notifications_insert ON public.notifications FOR INSERT TO bandarlog_user_app WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND EXISTS(SELECT FROM public.users u WHERE u.group_id=notifications.group_id AND u.email=notifications.email AND u.disabled_at IS NULL AND bandarlog_api.actor_user(u.id)) AND body LIKE 'bandarlog-sealed-v1:%' AND html='' AND status='pending');
--> statement-breakpoint
CREATE POLICY actor_push_insert ON public.push_outbox FOR INSERT TO bandarlog_user_app WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND EXISTS(SELECT FROM public.users u WHERE u.group_id=push_outbox.group_id AND u.id=push_outbox.user_id AND u.disabled_at IS NULL AND bandarlog_api.actor_user(u.id)));
--> statement-breakpoint
-- Updating the group must use the current bearer, never a caller-chosen session hash.
CREATE OR REPLACE FUNCTION bandarlog_api.update_group(p_actor text,p_name text,p_primary text,p_secondary text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF length(p_name) NOT BETWEEN 2 AND 100 OR p_primary !~ '^#[a-fA-F0-9]{6}$' OR p_secondary !~ '^#[a-fA-F0-9]{6}$' THEN RAISE EXCEPTION 'invalid settings' USING ERRCODE='22023'; END IF;
 IF session_user='bandarlog_http' THEN
 IF p_actor IS DISTINCT FROM (bandarlog_api.actor()->>'session') OR NOT bandarlog_api.actor_manages(true) THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501'; END IF;
ELSIF NOT EXISTS(SELECT FROM public.users u JOIN public.sessions s ON (s.group_id,s.user_id)=(u.group_id,u.id) WHERE s.id=p_actor AND u.group_id=bandarlog_api.current_group() AND u.role='admin' AND u.disabled_at IS NULL AND s.expires>now() AND s.absolute_expires_at>now()) THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501'; END IF;
 UPDATE public.scout_groups SET name=p_name,color_primary=p_primary,color_secondary=p_secondary WHERE id=bandarlog_api.current_group();
END $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.update_group(text,text,text,text) TO bandarlog_user_app;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.invitation_token(p_id text,p_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE i public.invitations; BEGIN
 SELECT * INTO i FROM public.invitations WHERE id=p_id AND group_id=bandarlog_api.current_group() AND status='pending' AND expires>statement_timestamp() FOR UPDATE;
 IF NOT FOUND OR p_hash !~ '^[a-f0-9]{64}$' OR NOT (bandarlog_api.actor_manages() OR (i.project_id IS NULL AND bandarlog_api.actor_commission(i.commission_id,true))) THEN RAISE EXCEPTION 'denied invitation' USING ERRCODE='42501'; END IF;
 INSERT INTO public.tokens(group_id,id,email,expires) VALUES(i.group_id,p_hash,i.email,i.expires);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.invitation_token(text,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.invitation_token(text,text) TO bandarlog_user_app;
