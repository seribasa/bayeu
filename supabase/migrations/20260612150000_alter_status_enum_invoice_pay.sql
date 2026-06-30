-- migrate:up
ALTER TYPE transactions_status_enum ADD VALUE IF NOT EXISTS 'started';
ALTER TYPE payments_status_enum ADD VALUE IF NOT EXISTS 'unpaid';
ALTER TYPE orders_status_enum ADD VALUE IF NOT EXISTS 'none';

-- migrate:down
DROP TYPE IF EXISTS transactions_status_enum;
DROP TYPE IF EXISTS payments_status_enum;
DROP TYPE IF EXISTS orders_status_enum;

