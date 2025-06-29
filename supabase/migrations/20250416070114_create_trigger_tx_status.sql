-- migrate:up
CREATE OR REPLACE FUNCTION update_status_from_transaction()
RETURNS TRIGGER AS $$
DECLARE
  new_payment_status payments.status%TYPE;
  new_order_status orders.status%TYPE;
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

  -- Update payments
  UPDATE payments 
  SET status = new_payment_status,
      updated_at = CURRENT_TIMESTAMP 
  WHERE payment_id = NEW.payment_id;

  -- Update orders
  UPDATE orders 
  SET status = new_order_status,
      updated_at = CURRENT_TIMESTAMP 
  WHERE order_id = (SELECT order_id FROM payments WHERE payment_id = NEW.payment_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_payment_order_status ON transactions;

CREATE TRIGGER trigger_update_payment_order_status
AFTER UPDATE OF status ON transactions
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION update_status_from_transaction();

-- migrate:down
DROP TRIGGER IF EXISTS trigger_update_payment_order_status ON transactions;
DROP FUNCTION IF EXISTS update_status_from_transaction
