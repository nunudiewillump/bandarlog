-- Override 0019 safely; preserve existing grants and historic rows.
CREATE OR REPLACE FUNCTION bandarlog_api.request_group(p_hash text, p_input jsonb, p_mail jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
IF p_hash !~ '^[a-f0-9]{64}$' OR length(p_input->>'groupName') NOT BETWEEN 2 AND 100 OR length(p_input->>'name') NOT BETWEEN 2 AND 100
OR length(p_input->>'email')>320 OR p_input->>'email' NOT LIKE '%@%' OR p_input->>'colorPrimary' !~ '^#[a-fA-F0-9]{6}$' OR p_input->>'colorSecondary' !~ '^#[a-fA-F0-9]{6}$' THEN RAISE EXCEPTION 'invalid registration' USING ERRCODE='22023'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(p_input->>'email',0));
IF (SELECT count(*) FROM public.group_registrations WHERE email=p_input->>'email' AND created_at>now()-interval '1 hour')>=3 THEN RETURN; END IF;
INSERT INTO public.group_registrations(id,email,name,group_name,color_primary,color_secondary,expires)
VALUES(p_hash,p_input->>'email',p_input->>'name',p_input->>'groupName',p_input->>'colorPrimary',p_input->>'colorSecondary',now()+interval '7 days') ON CONFLICT DO NOTHING;
PERFORM bandarlog_api.queue_registration_mail(p_mail,'join@bandarlog.app','group-request-'||p_hash);
END
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.activate_group(p_hash text, p_session text, p_csrf text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE r public.group_registrations; g public.scout_groups; uid text:=gen_random_uuid()::text; BEGIN
IF p_session !~ '^[a-f0-9]{64}$' OR p_csrf !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid session' USING ERRCODE='22023'; END IF;
SELECT * INTO r FROM public.group_registrations WHERE activation_id=p_hash AND expires>now() AND approved_at IS NOT NULL AND rejected_at IS NULL AND consumed_at IS NULL FOR UPDATE;
IF NOT FOUND THEN RETURN NULL; END IF;
INSERT INTO public.scout_groups(name,color_primary,color_secondary) VALUES(r.group_name,r.color_primary,r.color_secondary) RETURNING * INTO g;
INSERT INTO public.users(id,group_id,name,email,role,preferences) VALUES(uid,g.id,r.name,r.email,'admin','{"foundingAdmin":true}');
INSERT INTO public.sessions(id,group_id,user_id,csrf,expires,absolute_expires_at) VALUES(p_session,g.id,uid,p_csrf,now()+interval '30 days',now()+interval '90 days');
UPDATE public.group_registrations SET consumed_at=now() WHERE id=r.id;
RETURN to_jsonb(g); END
$function$;
