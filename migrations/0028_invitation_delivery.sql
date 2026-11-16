REVOKE EXECUTE ON FUNCTION bandarlog_api.invitation_token(text,text) FROM bandarlog_user_app;
--> statement-breakpoint
ALTER POLICY actor_insert ON public.invitations WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND bandarlog_api.actor_manages(true));
--> statement-breakpoint
ALTER POLICY actor_update ON public.invitations USING(group_id=(SELECT bandarlog_api.current_group()) AND bandarlog_api.actor_manages(true)) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()) AND bandarlog_api.actor_manages(true));
--> statement-breakpoint
ALTER POLICY actor_delete ON public.invitations USING(group_id=(SELECT bandarlog_api.current_group()) AND bandarlog_api.actor_manages(true));
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.queue_invitation(p_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE i public.invitations; stamp text; BEGIN
 IF NOT bandarlog_api.actor_manages(true) THEN RAISE EXCEPTION 'denied invitation' USING ERRCODE='42501'; END IF;
 PERFORM bandarlog_api.recent_actor();
 SELECT * INTO i FROM public.invitations WHERE id=p_id AND group_id=bandarlog_api.current_group() AND status='pending' AND expires BETWEEN statement_timestamp() AND statement_timestamp()+interval '7 days 1 minute' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'invalid invitation' USING ERRCODE='42501'; END IF;
 stamp:=encode(sha256(convert_to('invitation:'||i.id||':'||i.expires::text,'UTF8')),'hex');
 INSERT INTO public.notifications(group_id,id,dedupe,email,subject,body,html,status,created_at) VALUES(i.group_id,stamp,stamp,i.email,'Te invitan a Bandarlog','invitation-event-v1:'||jsonb_build_object('invitationId',i.id,'name',i.name)::text,'','pending_v2',statement_timestamp()) ON CONFLICT(dedupe) DO NOTHING;
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.prepare_invitation_delivery(p_id text,p_lease text,p_hash text,p_body text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE n public.notifications; i public.invitations; BEGIN
 SELECT * INTO n FROM public.notifications WHERE id=p_id AND lease_id=p_lease AND status='sending' AND body LIKE 'invitation-event-v1:%' FOR UPDATE;
 IF NOT FOUND OR p_hash !~ '^[a-f0-9]{64}$' OR p_body NOT LIKE 'bandarlog-sealed-v1:%' THEN RETURN false; END IF;
 SELECT * INTO i FROM public.invitations WHERE id=(substring(n.body FROM length('invitation-event-v1:')+1)::jsonb->>'invitationId') AND group_id=n.group_id AND email=n.email AND status='pending' AND expires>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN UPDATE public.notifications SET status='cancelled',lease_id=NULL,lease_until=NULL WHERE id=n.id; RETURN false; END IF;
 INSERT INTO public.tokens(group_id,id,email,expires) VALUES(i.group_id,p_hash,i.email,least(i.expires,statement_timestamp()+interval '10 minutes'));
 UPDATE public.notifications SET body=p_body,html='' WHERE id=n.id;
 RETURN true;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.queue_invitation(text),bandarlog_api.prepare_invitation_delivery(text,text,text,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.queue_invitation(text) TO bandarlog_user_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.prepare_invitation_delivery(text,text,text,text) TO bandarlog_delivery_app;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.reactivate_user(p_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE a jsonb; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('user-administration:'||(bandarlog_api.actor()->>'group'),0));a:=bandarlog_api.actor();
 IF a->>'role'<>'admin' OR p_id=a->>'id' THEN RAISE EXCEPTION 'denied reactivation' USING ERRCODE='42501'; END IF;
 PERFORM bandarlog_api.recent_actor();
 UPDATE public.users SET disabled_at=NULL,role='member' WHERE id=p_id AND group_id=a->>'group' AND disabled_at IS NOT NULL;
 IF FOUND THEN INSERT INTO bandarlog_api.security_audit(group_id,actor_id,action,target_id) VALUES(a->>'group',a->>'id','user.reactivated',p_id); END IF;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.reactivate_user(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.reactivate_user(text) TO bandarlog_user_app;
