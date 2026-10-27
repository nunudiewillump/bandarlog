CREATE TABLE "artwork_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"collection" text NOT NULL,
	"family" text NOT NULL,
	"icon_data" text NOT NULL,
	"mascot_data" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artwork_entries" ADD CONSTRAINT "artwork_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;