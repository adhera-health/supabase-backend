-- Enforce append-only audit_logs (ISO 27001 / MDR traceability).

REVOKE UPDATE, DELETE ON TABLE public.audit_logs FROM PUBLIC;
REVOKE UPDATE, DELETE ON TABLE public.audit_logs FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.audit_logs FROM authenticated;

CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only';
END;
$$;

COMMENT ON FUNCTION public.prevent_audit_log_mutation() IS
  'Blocks UPDATE/DELETE on audit_logs for all roles including service_role.';

CREATE TRIGGER audit_logs_prevent_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_mutation();

CREATE TRIGGER audit_logs_prevent_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_mutation();
