-- migrate:up
CREATE TABLE IF NOT EXISTS "orders" (
	"order_id" UUID NOT NULL UNIQUE default gen_random_uuid(),
	"user_id" VARCHAR(255),
	"total_amount" NUMERIC,
	"currency" VARCHAR(255),
	"status" VARCHAR(255),
	"created_at" TIMESTAMPTZ,
	"updated_at" TIMESTAMPTZ,
	PRIMARY KEY("order_id")
);

CREATE TABLE IF NOT EXISTS "order_items" (
	"order_item_id" UUID NOT NULL UNIQUE default gen_random_uuid(),
	"order_id" UUID,
	"product_id" UUID,
	"quantity" INTEGER,
	"price" NUMERIC,
	"created_at" TIMESTAMPTZ,
	"updated_at" TIMESTAMPTZ,
	PRIMARY KEY("order_item_id")
);

CREATE TABLE IF NOT EXISTS "products" (
	"product_id" UUID NOT NULL UNIQUE default gen_random_uuid(),
	"name" VARCHAR(255),
	"description" VARCHAR(255),
	"price" NUMERIC,
	"created_at" TIMESTAMPTZ,
	"updated_at" TIMESTAMPTZ,
	PRIMARY KEY("product_id")
);

CREATE TABLE IF NOT EXISTS "payments" (
	"payment_id" UUID NOT NULL UNIQUE default gen_random_uuid(),
	"gateway_payment_id" VARCHAR(255),
	"order_id" UUID,
	"gateway_id" UUID,
	"amount" NUMERIC,
	"currency" VARCHAR(255),
	"status" VARCHAR(255),
	"created_at" TIMESTAMPTZ,
	"updated_at" TIMESTAMPTZ,
	"user_id" VARCHAR(255),
	PRIMARY KEY("payment_id")
);

CREATE TABLE IF NOT EXISTS "payment_gateway" (
	"gateway_id" UUID NOT NULL UNIQUE default gen_random_uuid(),
	"name" VARCHAR(255),
	"created_at" TIMESTAMPTZ,
	"updated_at" TIMESTAMPTZ,
	PRIMARY KEY("gateway_id")
);

CREATE TABLE IF NOT EXISTS "transactions" (
	"transaction_id" UUID NOT NULL UNIQUE default gen_random_uuid(),
	"payment_id" UUID,
	"gateway_transaction_id" VARCHAR(255),
	"gateway_response" TEXT,
	"status" VARCHAR(255),
	"created_at" TIMESTAMPTZ,
	"updated_at" TIMESTAMPTZ,
	PRIMARY KEY("transaction_id")
);

ALTER TABLE "public"."order_items"
ADD FOREIGN KEY("order_id") REFERENCES "orders"("order_id")
ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "public"."order_items"
ADD FOREIGN KEY("product_id") REFERENCES "products"("product_id")
ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE "public"."payments"
ADD FOREIGN KEY("order_id") REFERENCES "orders"("order_id")
ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE "public"."payments"
ADD FOREIGN KEY("gateway_id") REFERENCES "payment_gateway"("gateway_id")
ON UPDATE NO ACTION ON DELETE NO ACTION;

ALTER TABLE "public"."transactions"
ADD FOREIGN KEY("payment_id") REFERENCES "payments"("payment_id")
ON UPDATE NO ACTION ON DELETE NO ACTION;

alter table "public"."orders" enable row level security;

alter table "public"."order_items" enable row level security;

alter table "public"."products" enable row level security;

alter table "public"."payments" enable row level security;

alter table "public"."payment_gateway" enable row level security;

alter table "public"."transactions" enable row level security;

create policy "order only for service_role."
on "public"."orders"
for ALL
to service_role
using ( true );

create policy "order_items only for service_role."
on "public"."order_items"
for ALL
to service_role
using ( true );

create policy "products only for service_role."
on "public"."products"
for ALL
to service_role
using ( true );

create policy "payments only for service_role."
on "public"."payments"
for ALL
to service_role
using ( true );

create policy "payment_gateway only for service_role."
on "public"."payment_gateway"
for ALL
to service_role
using ( true );

create policy "transactions only for service_role."
on "public"."transactions"
for ALL
to service_role
using ( true );;

-- migrate:down
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.payment_gateway CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;