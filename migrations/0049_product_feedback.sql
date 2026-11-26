CREATE TABLE bandarlog_api.product_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('bug','idea','help','general')),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 3000),
  reply_email text CHECK (length(reply_email) <= 254),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','in_progress','resolved','archived')),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
--> statement-breakpoint
REVOKE ALL ON bandarlog_api.product_feedback FROM PUBLIC;
--> statement-breakpoint
CREATE INDEX product_feedback_status_page ON bandarlog_api.product_feedback(status, id);
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.product_feedback_submit(p_category text, p_body text, p_reply text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE feedback_id uuid;
BEGIN
  IF bandarlog_api.current_group() IS NULL OR
     (session_user='bandarlog_http' AND bandarlog_api.actor_id() IS NULL) THEN
    RAISE EXCEPTION 'Group session required' USING ERRCODE='42501';
  END IF;
  INSERT INTO bandarlog_api.product_feedback(category,body,reply_email)
  VALUES (p_category,btrim(p_body),nullif(btrim(p_reply),''))
  RETURNING id INTO feedback_id;
  RETURN feedback_id;
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.product_feedback_list(p_token text,p_after uuid,p_limit integer,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM bandarlog_api.platform_admin_actor(p_token);
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(items) ORDER BY items.id),'[]'::jsonb)
    FROM (SELECT id,category,body,reply_email,status,revision,created_at
      FROM bandarlog_api.product_feedback
      WHERE (p_after IS NULL OR id>p_after) AND (p_status='' OR status=p_status)
      ORDER BY id LIMIT least(greatest(coalesce(p_limit,26),1),101)) items);
END $$;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.product_feedback_review(p_token text,p_csrf text,p_id uuid,p_status text,p_revision integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;
BEGIN
  IF p_csrf IS NULL THEN RAISE EXCEPTION 'csrf required' USING ERRCODE='42501'; END IF;
  actor := bandarlog_api.platform_admin_actor(p_token,p_csrf);
  UPDATE bandarlog_api.product_feedback SET status=p_status,revision=revision+1
  WHERE id=p_id AND revision=p_revision;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO bandarlog_api.platform_audit(admin_id,action,target)
  VALUES (actor->>'id','feedback.status',p_id::text);
  RETURN true;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.product_feedback_submit(text,text,text),
  bandarlog_api.product_feedback_list(text,uuid,integer,text),
  bandarlog_api.product_feedback_review(text,text,uuid,text,integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.product_feedback_submit(text,text,text)
  TO bandarlog_user_app, bandarlog_group_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.product_feedback_list(text,uuid,integer,text),
  bandarlog_api.product_feedback_review(text,text,uuid,text,integer) TO bandarlog_identity;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 49 $$;
