-- migrate:up
ALTER TABLE orders
ADD COLUMN gateway_response JSON DEFAULT NULL;

-- migrate:down
ALTER TABLE orders
DROP COLUMN gateway_response;
