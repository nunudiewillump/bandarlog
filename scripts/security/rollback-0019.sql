-- Emergency rollback after stopping the new HTTP runtime. Retains every row and function.
-- Restores the former, weaker owner-credential architecture. Operator approval required.
BEGIN;
DO $$ DECLARE t record; BEGIN
FOR t IN SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='group_isolation' LOOP
EXECUTE format('ALTER POLICY group_isolation ON public.%I USING(group_id=current_setting(''bandarlog.group_id'',true)) WITH CHECK(group_id=current_setting(''bandarlog.group_id'',true))',t.tablename);
EXECUTE format('ALTER TABLE public.%I ALTER COLUMN group_id SET DEFAULT coalesce(nullif(current_setting(''bandarlog.group_id'',true),''''),''rosales-702'')',t.tablename);
END LOOP;
END $$;
COMMIT;
