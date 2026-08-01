-- migrate:up
-- Update transaction trigger to prevent regressing terminal paid and refunded orders

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
      v_old_order_status NOT IN ('paid', 'settlement') OR new_order_status IN ('paid', 'settlement', 'refunded')
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
-- Function update can be reverted by checking the previous migration or history.
