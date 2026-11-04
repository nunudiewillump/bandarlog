CREATE TABLE "group_registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"group_name" text NOT NULL,
	"color_primary" text NOT NULL,
	"color_secondary" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scout_groups" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"private_id" text DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"name" text NOT NULL,
	"color_primary" text DEFAULT '#d75a9e' NOT NULL,
	"color_secondary" text DEFAULT '#7b3d93' NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scout_groups_private_id_unique" UNIQUE("private_id")
);
--> statement-breakpoint
INSERT INTO scout_groups(id,name) VALUES ('rosales-702','Rosales del Canal 702');
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "auth_challenges" DROP CONSTRAINT "auth_challenges_pkey";--> statement-breakpoint
ALTER TABLE "google_identities" DROP CONSTRAINT "google_identities_pkey";--> statement-breakpoint
ALTER TABLE "push_subscriptions" DROP CONSTRAINT "push_subscriptions_pkey";--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "artwork_entries" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "google_identities" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "google_links" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "google_states" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "mutation_receipts" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "project_members" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "push_outbox" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "tutorial_progress" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "group_id" text DEFAULT coalesce(nullif(current_setting('bandarlog.group_id', true), ''), 'rosales-702') NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_group_id_email_pk" PRIMARY KEY("group_id","email");
--> statement-breakpoint
ALTER TABLE "google_identities" ADD CONSTRAINT "google_identities_group_id_subject_pk" PRIMARY KEY("group_id","subject");
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_group_id_id_pk" PRIMARY KEY("group_id","id");
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork_entries" ADD CONSTRAINT "artwork_entries_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_identities" ADD CONSTRAINT "google_identities_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_links" ADD CONSTRAINT "google_links_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_states" ADD CONSTRAINT "google_states_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutation_receipts" ADD CONSTRAINT "mutation_receipts_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_outbox" ADD CONSTRAINT "push_outbox_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorial_progress" ADD CONSTRAINT "tutorial_progress_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_group_id_scout_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scout_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_group_email" ON "users" USING btree ("group_id","email");
--> statement-breakpoint
DO $$
DECLARE t text; c record;
  tenant_tables text[] := ARRAY['users','projects','commissions','members','tasks','assignments','activity','sessions','tokens','invitations','notifications','project_members','artwork_entries','auth_challenges','google_identities','google_states','google_links','push_subscriptions','mutation_receipts','push_outbox','tutorial_progress'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bandarlog_group_app') THEN
    CREATE ROLE bandarlog_group_app NOLOGIN NOINHERIT;
  END IF;
  EXECUTE format('GRANT bandarlog_group_app TO %I',current_user);
  GRANT USAGE ON SCHEMA public TO bandarlog_group_app;
  FOREACH t IN ARRAY ARRAY['users','projects','commissions','tasks'] LOOP
    EXECUTE format('CREATE UNIQUE INDEX %I ON %I(group_id,id)',t || '_group_reference',t);
  END LOOP;
  -- Composite foreign keys also reject cross-group associations at DB level.
  FOR c IN
    SELECT con.conname, rel.relname AS source, a.attname AS column_name,
      ref.relname AS target, ra.attname AS target_column
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid
    JOIN pg_class ref ON ref.oid=con.confrelid
    JOIN pg_attribute a ON a.attrelid=rel.oid AND a.attnum=con.conkey[1]
    JOIN pg_attribute ra ON ra.attrelid=ref.oid AND ra.attnum=con.confkey[1]
    WHERE con.contype='f' AND array_length(con.conkey,1)=1
      AND rel.relname=ANY(tenant_tables)
      AND ref.relname=ANY(ARRAY['users','projects','commissions','tasks'])
  LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(group_id,%I) REFERENCES %I(group_id,%I)',c.source,c.conname || '_group',c.column_name,c.target,c.target_column);
  END LOOP;
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('CREATE INDEX %I ON %I(group_id)',t || '_group_scope',t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY group_isolation ON %I TO bandarlog_group_app USING(group_id=current_setting(''bandarlog.group_id'',true)) WITH CHECK(group_id=current_setting(''bandarlog.group_id'',true))',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO bandarlog_group_app',t);
  END LOOP;
END $$;

--> statement-breakpoint
CREATE TABLE "platform_mail" (
	"id" text PRIMARY KEY NOT NULL,
	"dedupe" text NOT NULL,
	"email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"html" text NOT NULL,
	"status" text NOT NULL,
	"attempts" text DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "platform_mail_dedupe_unique" UNIQUE("dedupe")
);

--> statement-breakpoint
ALTER TABLE "group_registrations" ADD COLUMN "activation_id" text;--> statement-breakpoint
ALTER TABLE "group_registrations" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group_registrations" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group_registrations" ADD CONSTRAINT "group_registrations_activation_id_unique" UNIQUE("activation_id");