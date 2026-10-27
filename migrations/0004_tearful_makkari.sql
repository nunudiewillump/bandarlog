CREATE TABLE "project_members" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN "icon_url" text;--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN "mascot_url" text;--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN "artwork_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_membership" ON "project_members" USING btree ("project_id","user_id");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP INDEX invitation_group_pending;
--> statement-breakpoint
CREATE UNIQUE INDEX invitation_group_pending ON invitations(lower(email)) WHERE status='pending' AND commission_id IS NULL AND project_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX invitation_project_pending ON invitations(project_id,lower(email)) WHERE status='pending' AND project_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE invitations ADD CONSTRAINT invitation_single_scope CHECK (commission_id IS NULL OR project_id IS NULL);

--> statement-breakpoint
UPDATE commissions SET artwork_status='unavailable';
