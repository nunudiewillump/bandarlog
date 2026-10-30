CREATE TABLE "tutorial_progress" (
	"user_id" text PRIMARY KEY NOT NULL,
	"events" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"task_status" text DEFAULT 'pending' NOT NULL,
	"previous_status" text,
	"steps" jsonb DEFAULT '[false,false]'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"last_activity_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tutorial_progress" ADD CONSTRAINT "tutorial_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;