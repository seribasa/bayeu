INSERT INTO "public"."payment_gateway" ("gateway_id", "name", "created_at", "updated_at")
VALUES
    ('c7e0d478-4777-47b0-85ec-82cf3fb82b76', 'stripe', now(), now()),
    ('a3dd2232-2a69-4a3d-bdbe-5353ab053990', 'midtrans', now(), now())
ON CONFLICT DO NOTHING;