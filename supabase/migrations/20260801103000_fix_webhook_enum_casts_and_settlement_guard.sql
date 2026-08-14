-- migrate:up
-- Fix missing enum casts for status assignments and remove invalid 'settlement' from orders_status_enum checks

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
    v_old_status VARCHAR(255);
BEGIN
    -- 1. Row-lock order row to serialize concurrent webhooks
    SELECT status, metadata INTO v_old_status, v_metadata
    FROM orders
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_old_status IS NULL THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    -- 2. Fetch Gateway ID
    SELECT gateway_id INTO v_gateway_id
    FROM payment_gateway
    WHERE LOWER(name) = LOWER(p_gateway_name)
    LIMIT 1;

    IF v_gateway_id IS NULL THEN
        RAISE EXCEPTION 'Payment gateway % not found', p_gateway_name;
    END IF;

    -- 3. Fetch or Create Payment
    SELECT payment_id INTO v_payment_id
    FROM payments
    WHERE order_id = p_order_id
    LIMIT 1;

    IF v_payment_id IS NULL THEN
        INSERT INTO payments (gateway_payment_id, order_id, gateway_id, amount, currency, status, created_at, updated_at)
        VALUES (p_gateway_payment_id, p_order_id, v_gateway_id, p_amount, LOWER(p_currency), p_payment_status::payments_status_enum, NOW(), NOW())
        RETURNING payment_id INTO v_payment_id;
    ELSE
        -- Prevent regressing terminal paid payments, but allow refunds. Never regress from refunded.
        IF v_old_status != 'refunded' AND (
            v_old_status NOT IN ('paid') OR p_order_status IN ('paid', 'refunded')
        ) THEN
            UPDATE payments
            SET status = p_payment_status::payments_status_enum, updated_at = NOW()
            WHERE payment_id = v_payment_id;
        END IF;
    END IF;

    -- 4. Atomic Upsert Transaction with ON CONFLICT
    INSERT INTO transactions (payment_id, gateway_transaction_id, gateway_response, status, created_at, updated_at)
    VALUES (v_payment_id, p_gateway_transaction_id, p_gateway_response::TEXT, p_transaction_status::transactions_status_enum, NOW(), NOW())
    ON CONFLICT (gateway_transaction_id) DO UPDATE
    SET status = EXCLUDED.status,
        gateway_response = EXCLUDED.gateway_response,
        updated_at = NOW();

    -- 5. Update Order Status (prevent regressing terminal paid orders, but allow refunds. Never regress from refunded)
    IF v_old_status != 'refunded' AND (
        v_old_status NOT IN ('paid') OR p_order_status IN ('paid', 'refunded')
    ) THEN
        UPDATE orders
        SET status = p_order_status::orders_status_enum, updated_at = NOW()
        WHERE order_id = p_order_id;
    END IF;

    NOTIFY pgrst, 'reload schema';

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'order_id', p_order_id,
        'already_paid', (v_old_status = 'paid'),
        'metadata', v_metadata
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION update_status_from_transaction()
RETURNS TRIGGER AS $$
DECLARE
  new_payment_status payments.status%TYPE;
  new_order_status orders.status%TYPE;
  v_old_order_status orders.status%TYPE;
  v_order_id UUID;
BEGIN
  -- Mapping transaksi ke payments
  CASE NEW.status
    WHEN 'initiated'   THEN new_payment_status := 'initiated'; new_order_status := 'draft';
    WHEN 'pending'     THEN new_payment_status := 'waiting_payment'; new_order_status := 'waiting_payment';
    WHEN 'processing'  THEN new_payment_status := 'processing'; new_order_status := 'processing';
    WHEN 'success'     THEN new_payment_status := 'paid'; new_order_status := 'paid';
    WHEN 'failed'      THEN new_payment_status := 'failed'; new_order_status := 'failed';
    WHEN 'expired'     THEN new_payment_status := 'expired'; new_order_status := 'cancelled';
    WHEN 'cancelled'   THEN new_payment_status := 'cancelled'; new_order_status := 'cancelled';
    WHEN 'refunded'    THEN new_payment_status := 'refunded'; new_order_status := 'refunded';
  END CASE;

  -- Get current order status
  SELECT order_id INTO v_order_id FROM payments WHERE payment_id = NEW.payment_id;
  SELECT status INTO v_old_order_status FROM orders WHERE order_id = v_order_id;

  -- Prevent regressing terminal paid orders, but allow refunds. Never regress from refunded.
  IF v_old_order_status != 'refunded' AND (
      v_old_order_status NOT IN ('paid') OR new_order_status IN ('paid', 'refunded')
  ) THEN
      -- Update payments
      UPDATE payments 
      SET status = new_payment_status,
          updated_at = CURRENT_TIMESTAMP 
      WHERE payment_id = NEW.payment_id;

      -- Update orders
      UPDATE orders 
      SET status = new_order_status,
          updated_at = CURRENT_TIMESTAMP 
      WHERE order_id = v_order_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- migrate:down
