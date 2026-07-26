-- migrate:up
ALTER TYPE orders_status_enum ADD VALUE IF NOT EXISTS 'expire';
NOTIFY pgrst, 'reload schema';

-- migrate:down
-- Enum values in PostgreSQL cannot be removed without recreating the enum.
