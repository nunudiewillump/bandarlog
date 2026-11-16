ALTER TABLE public.google_states ADD COLUMN handoff_challenge text;
--> statement-breakpoint
CREATE TABLE public.google_handoffs (
 group_id text NOT NULL DEFAULT nullif(current_setting('bandarlog.group_id',true),''),
 id text PRIMARY KEY,
 challenge text NOT NULL,
 user_id text,
 google_subject text,
 google_email text,
 expires timestamptz NOT NULL,
 FOREIGN KEY(group_id) REFERENCES public.scout_groups(id),
 FOREIGN KEY(group_id,user_id) REFERENCES public.users(group_id,id),
 CHECK ((user_id IS NOT NULL AND google_subject IS NULL AND google_email IS NULL) OR (user_id IS NULL AND google_subject IS NOT NULL AND google_email IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE public.google_handoffs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY group_isolation ON public.google_handoffs TO bandarlog_group_app USING(group_id=(SELECT bandarlog_api.current_group())) WITH CHECK(group_id=(SELECT bandarlog_api.current_group()));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public.google_handoffs TO bandarlog_group_app;
--> statement-breakpoint
CREATE INDEX google_handoffs_group_expiry ON public.google_handoffs(group_id,expires);
