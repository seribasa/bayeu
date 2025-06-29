INSERT INTO "public"."product" ("product_id", "name", "description", "price", "created_at", "updated_at")
VALUES
    ('4cf70de1-35d6-4794-a249-9b79c328f086', 'Booking Fee', 'General booking fee for appointments', 10000, now(), now()),
ON CONFLICT DO NOTHING;