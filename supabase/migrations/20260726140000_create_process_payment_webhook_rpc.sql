-- migrate:up
CREATE OR REPLACE FUNCTION process_payment_webhook(
    p_order_id UUID,
    p_gateway_name VARCHAR(255),
    p_gateway_payment_id VARCHAR(255),
    p_gateway_transaction_id VARCHAR(255),
    p_amount NUMERIC,
    p_currency VARCHAR(255),
    p_payment_status VARCHAR(255),
    p_transaction_status VARCHAR(255),
    p_order_status VARCHAR(255),
    p_gateway_response JSONB
) RETURNS JSONB AS $$
DECLARE
    v_gateway_id UUID;
    v_payment_id UUID;
    v_metadata JSONB;
BEGIN
    -- 1. Fetch Gateway ID
    SELECT gateway_id INTO v_gateway_id
    FROM payment_gateway
    WHERE LOWER(name) = LOWER(p_gateway_name)
    LIMIT 1;

    IF v_gateway_id IS NULL THEN
        RAISE EXCEPTION 'Payment gateway % not found', p_gateway_name;
    END IF;

    -- 2. Fetch or Create Payment
    SELECT payment_id INTO v_payment_id
    FROM payments
    WHERE order_id = p_order_id
    LIMIT 1;

    IF v_payment_id IS NULL THEN
        INSERT INTO payments (gateway_payment_id, order_id, gateway_id, amount, currency, status, created_at, updated_at)
        VALUES (p_gateway_payment_id, p_order_id, v_gateway_id, p_amount, LOWER(p_currency), p_payment_status, NOW(), NOW())
        RETURNING payment_id INTO v_payment_id;
    ELSE
        UPDATE payments
        SET status = p_payment_status, updated_at = NOW()
        WHERE payment_id = v_payment_id;
    END IF;

    -- 3. Record Transaction
    INSERT INTO transactions (payment_id, gateway_transaction_id, gateway_response, status, created_at, updated_at)
    VALUES (v_payment_id, p_gateway_transaction_id, p_gateway_response::TEXT, p_transaction_status, NOW(), NOW());

    -- 4. Update Order Status & Fetch Metadata
    UPDATE orders
    SET status = p_order_status, updated_at = NOW()
    WHERE order_id = p_order_id
    RETURNING metadata INTO v_metadata;

    NOTIFY pgrst, 'reload schema';

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'order_id', p_order_id,
        'metadata', v_metadata
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- migrate:down
DROP FUNCTION IF EXISTS process_payment_webhook;
