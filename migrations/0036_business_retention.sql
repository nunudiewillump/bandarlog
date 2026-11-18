-- The HTTP API archives projects and logically removes commissions/tasks. It
-- must not have a second SQL-only path that cascades away their audit history.
REVOKE DELETE ON public.projects,public.commissions,public.tasks FROM bandarlog_user_app;
--> statement-breakpoint
DROP POLICY actor_delete ON public.projects;
--> statement-breakpoint
DROP POLICY actor_delete ON public.commissions;
--> statement-breakpoint
DROP POLICY actor_delete ON public.tasks;
--> statement-breakpoint
CREATE FUNCTION bandarlog_api.runtime_contract_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT 36 $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION bandarlog_api.runtime_contract_version() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bandarlog_api.runtime_contract_version() TO bandarlog_http,bandarlog_identity,bandarlog_delivery;
