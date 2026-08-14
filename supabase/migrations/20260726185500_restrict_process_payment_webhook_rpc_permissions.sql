-- migrate:up
-- Revoke execution on process_payment_webhook from PUBLIC, anon, and authenticated roles to prevent forged RPC calls via PostgREST
REVOKE EXECUTE ON FUNCTION process_payment_webhook FROM PUBLIC, anon, authenticated;

-- Grant execution exclusively to service_role and postgres
GRANT EXECUTE ON FUNCTION process_payment_webhook TO service_role, postgres;

NOTIFY pgrst, 'reload schema';

-- migrate:down
GRANT EXECUTE ON FUNCTION process_payment_webhook TO PUBLIC;
