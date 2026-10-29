DROP INDEX "commission_project_name";--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commissions" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_project_name" ON "commissions" USING btree ("project_id","name") WHERE "commissions"."deleted_at" is null;