-- Remove meeting records and links. Follow-up tasks remain ordinary project tasks.
DROP TABLE public.project_followups;
--> statement-breakpoint
DROP TABLE public.project_minutes;
--> statement-breakpoint
DROP TABLE public.project_decisions;
--> statement-breakpoint
DROP FUNCTION bandarlog_api.check_project_followup();
--> statement-breakpoint
DROP FUNCTION bandarlog_api.preserve_closed_project_minutes();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 54 $$;
