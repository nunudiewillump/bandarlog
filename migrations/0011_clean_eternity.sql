ALTER TABLE "projects" ALTER COLUMN "type" SET DEFAULT 'general';
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "project_type";
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "project_type" CHECK ("type" IN ('general','camp','event','other','ronda'));
