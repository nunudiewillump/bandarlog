ALTER TABLE public.notifications ADD COLUMN lease_id text;
--> statement-breakpoint
ALTER TABLE public.notifications ADD COLUMN lease_until timestamptz;
--> statement-breakpoint
ALTER TABLE public.platform_mail ADD COLUMN lease_id text;
--> statement-breakpoint
ALTER TABLE public.platform_mail ADD COLUMN lease_until timestamptz;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.claim_platform_mail_v2() RETURNS SETOF jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 UPDATE public.platform_mail m SET status='sending',lease_id=gen_random_uuid()::text,lease_until=statement_timestamp()+interval '15 minutes'
 WHERE id IN(SELECT id FROM public.platform_mail WHERE attempts::integer<5 AND
 ((status IN ('pending','pending_v2') AND (next_attempt_at IS NULL OR next_attempt_at<=statement_timestamp())) OR (status='sending' AND (lease_until IS NULL OR lease_until<=statement_timestamp())))
 ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED)
 RETURNING to_jsonb(m)
$$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.finish_platform_mail_v2(p_id text,p_lease text,p_result jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 UPDATE public.platform_mail SET status=CASE WHEN p_result->>'status' IN ('sent','pending','failed') THEN p_result->>'status' ELSE 'failed' END,
 attempts=coalesce(p_result->>'attempts',attempts),sent_at=(p_result->>'sentAt')::timestamptz,next_attempt_at=(p_result->>'nextAttemptAt')::timestamptz,provider_message_id=p_result->>'providerMessageId',lease_id=NULL,lease_until=NULL
 WHERE id=p_id AND lease_id=p_lease AND status='sending'
$$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.platform_next_v2() RETURNS timestamptz LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT min(CASE status WHEN 'sending' THEN coalesce(lease_until,statement_timestamp()) ELSE coalesce(next_attempt_at,statement_timestamp()) END) FROM public.platform_mail WHERE status IN ('pending','pending_v2','sending') AND attempts::integer<5
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.claim_platform_mail_v2(),bandarlog_api.finish_platform_mail_v2(text,text,jsonb),bandarlog_api.platform_next_v2() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.claim_platform_mail_v2(),bandarlog_api.finish_platform_mail_v2(text,text,jsonb),bandarlog_api.platform_next_v2() TO bandarlog_delivery;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION bandarlog_api.claim_platform_mail(),bandarlog_api.finish_platform_mail(text,jsonb),bandarlog_api.platform_next() FROM bandarlog_delivery;

--> statement-breakpoint
CREATE FUNCTION bandarlog_api.refresh_platform_lease(p_id text,p_lease text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 UPDATE public.platform_mail SET lease_until=statement_timestamp()+interval '15 minutes' WHERE id=p_id AND lease_id=p_lease AND status='sending'; RETURN FOUND;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.refresh_platform_lease(text,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.refresh_platform_lease(text,text) TO bandarlog_delivery;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.job_groups(p_pending boolean,p_mail boolean) RETURNS SETOF jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',g.id,'private_id',g.private_id,'name',g.name,'color_primary',g.color_primary,'color_secondary',g.color_secondary,'plan',g.plan) FROM public.scout_groups g WHERE g.plan<>'audit-archived' AND (NOT p_pending OR EXISTS(SELECT FROM public.notifications n WHERE n.group_id=g.id AND p_mail AND n.status IN ('pending','pending_v2','sending') AND n.attempts::integer<5) OR EXISTS(SELECT FROM public.push_outbox p WHERE p.group_id=g.id AND p.sent_at IS NULL))
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.queue_registration_mail(p_mail jsonb,p_email text,p_key text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 INSERT INTO public.platform_mail(id,dedupe,email,subject,body,html,status,created_at) VALUES(gen_random_uuid()::text,p_key,p_email,left(p_mail->>'subject',200),left(p_mail->>'body',256000),left(p_mail->>'html',32000),CASE WHEN p_mail->>'status' IN ('pending','pending_v2') THEN p_mail->>'status' ELSE 'preview' END,statement_timestamp()) ON CONFLICT(dedupe) DO NOTHING
$$;
