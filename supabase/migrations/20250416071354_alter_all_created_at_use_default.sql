-- migrate:up
ALTER TABLE orders ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE order_items ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE products ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE payments ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE payment_gateway ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE transactions ALTER COLUMN created_at SET DEFAULT NOW();

-- migrate:down
ALTER TABLE orders ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE order_items ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE products ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE payments ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE payment_gateway ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE transactions ALTER COLUMN created_at DROP DEFAULT;

