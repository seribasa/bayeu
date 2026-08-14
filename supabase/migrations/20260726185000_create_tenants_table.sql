-- migrate:up
CREATE TABLE IF NOT EXISTS tenants (
    tenant_id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    default_success_url TEXT,
    default_failed_url TEXT,
    default_cancel_url TEXT,
    webhook_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO tenants (tenant_id, name, default_success_url, default_failed_url, default_cancel_url, webhook_url)
VALUES (
    'kuala-api',
    'Kuala API',
    'https://kuala-app.peltops.com/payment/success',
    'https://kuala-app.peltops.com/payment/failed',
    'https://kuala-app.peltops.com/payment/cancel',
    'http://kuala-api:8080/invoices/payment-callback'
) ON CONFLICT (tenant_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- migrate:down
DROP TABLE IF EXISTS tenants;
