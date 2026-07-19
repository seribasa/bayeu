-- migrate:up
ALTER TABLE orders
ADD COLUMN gateway VARCHAR(255),
ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;

-- migrate:down
ALTER TABLE orders
DROP COLUMN gateway, metadata;