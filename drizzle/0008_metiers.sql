CREATE TYPE "public"."repair_item_kind" AS ENUM('part', 'labor');--> statement-breakpoint
CREATE TYPE "public"."repair_status" AS ENUM('open', 'in_progress', 'done', 'invoiced', 'cancelled');--> statement-breakpoint
CREATE TABLE "repair_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"repair_order_id" uuid NOT NULL,
	"kind" "repair_item_kind" NOT NULL,
	"product_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repair_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"status" "repair_status" DEFAULT 'open' NOT NULL,
	"mileage" integer,
	"complaint" text,
	"diagnosis" text,
	"promised_at" date,
	"invoice_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"plate" text NOT NULL,
	"brand" text,
	"model" text,
	"year" integer,
	"vin" text,
	"mileage" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "business_type" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "repair_order_items" ADD CONSTRAINT "repair_order_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_items" ADD CONSTRAINT "repair_order_items_repair_order_id_repair_orders_id_fk" FOREIGN KEY ("repair_order_id") REFERENCES "public"."repair_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_order_items" ADD CONSTRAINT "repair_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_orders" ADD CONSTRAINT "repair_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repair_order_items_order_idx" ON "repair_order_items" USING btree ("repair_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repair_orders_company_number_uq" ON "repair_orders" USING btree ("company_id","number");--> statement-breakpoint
CREATE INDEX "repair_orders_company_created_idx" ON "repair_orders" USING btree ("company_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "repair_orders_vehicle_idx" ON "repair_orders" USING btree ("company_id","vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_company_plate_uq" ON "vehicles" USING btree ("company_id","plate");--> statement-breakpoint
CREATE INDEX "vehicles_company_customer_idx" ON "vehicles" USING btree ("company_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_company_vin_uq" ON "products" USING btree ("company_id",("attributes"->>'vin')) WHERE "products"."attributes" ? 'vin' and "products"."is_active";--> statement-breakpoint
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "vehicles" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "repair_orders" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "repair_orders" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "repair_order_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "repair_order_items" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
-- Numérotation des ordres de réparation pour les entreprises existantes
INSERT INTO document_sequences (company_id, doc_type, prefix, current_year)
SELECT id, 'repair_order', 'OR', extract(year from now())::int FROM companies
ON CONFLICT DO NOTHING;
