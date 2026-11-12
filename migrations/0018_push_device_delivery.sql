CREATE TABLE "push_deliveries" (
	"group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"outbox_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"claimed_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_outbox_id_push_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."push_outbox"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX push_outbox_group_reference ON push_outbox(group_id,id);
--> statement-breakpoint
ALTER TABLE push_deliveries ADD CONSTRAINT push_deliveries_outbox_group_fk FOREIGN KEY(group_id,outbox_id) REFERENCES push_outbox(group_id,id);
--> statement-breakpoint
ALTER TABLE push_deliveries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY group_isolation ON push_deliveries TO bandarlog_group_app USING(group_id=current_setting('bandarlog.group_id',true)) WITH CHECK(group_id=current_setting('bandarlog.group_id',true));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON push_deliveries TO bandarlog_group_app;
--> statement-breakpoint
CREATE INDEX activity_group_page ON activity(group_id,created_at DESC,id DESC);
--> statement-breakpoint
CREATE INDEX notifications_group_page ON notifications(group_id,created_at DESC,id DESC);
