CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'accepted', 'refused', 'converted');--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"product_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" numeric(18, 2) NOT NULL,
	"discount" numeric(18, 2) DEFAULT 0 NOT NULL,
	"tax_rate" numeric(6, 3) DEFAULT 0 NOT NULL,
	"tax_amount" numeric(18, 2) DEFAULT 0 NOT NULL,
	"line_total" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"number" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"customer_id" uuid,
	"customer_snapshot" jsonb,
	"issue_date" date NOT NULL,
	"valid_until" date NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"subtotal" numeric(18, 2) NOT NULL,
	"global_discount" numeric(18, 2) DEFAULT 0 NOT NULL,
	"discount_total" numeric(18, 2) DEFAULT 0 NOT NULL,
	"tax_total" numeric(18, 2) DEFAULT 0 NOT NULL,
	"total" numeric(18, 2) NOT NULL,
	"tax_mode" text DEFAULT 'line' NOT NULL,
	"conditions" text,
	"notes" text,
	"public_token" text NOT NULL,
	"converted_invoice_id" uuid,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"refused_at" timestamp with time zone,
	"converted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_converted_invoice_id_invoices_id_fk" FOREIGN KEY ("converted_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_items_quote_idx" ON "quote_items" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_company_number_uq" ON "quotes" USING btree ("company_id","number");--> statement-breakpoint
CREATE INDEX "quotes_company_created_idx" ON "quotes" USING btree ("company_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "quotes_company_customer_idx" ON "quotes" USING btree ("company_id","customer_id");--> statement-breakpoint
-- Isolation multi-entreprise (même règle que les autres tables métier)
ALTER TABLE "quotes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "quotes" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "quote_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "quote_items" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
-- Page publique de proforma : résout l'entreprise à partir du jeton sans exposer les autres lignes
CREATE OR REPLACE FUNCTION public_quote_company(token text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM quotes WHERE public_token = token
$$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "quotes", "quote_items" TO app_user;
    GRANT EXECUTE ON FUNCTION public_quote_company(text) TO app_user;
  END IF;
END $$;
--> statement-breakpoint
-- Numérotation DEV-AAAA-000001 pour les entreprises qui n'en auraient pas encore
INSERT INTO "document_sequences" ("company_id", "doc_type", "prefix", "current_year")
SELECT "id", 'quote', 'DEV', extract(year FROM now())::int FROM "companies"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Nouvelles permissions : qui consultait les factures consulte les proformas, qui les créait crée les proformas.
-- (L'Administrateur reçoit toujours toutes les permissions à la connexion.)
UPDATE "roles" SET "permissions" = array_append("permissions", 'quotes.view')
WHERE 'invoices.view' = ANY("permissions") AND NOT ('quotes.view' = ANY("permissions"));
--> statement-breakpoint
UPDATE "roles" SET "permissions" = array_append("permissions", 'quotes.create')
WHERE 'invoices.create' = ANY("permissions") AND NOT ('quotes.create' = ANY("permissions"));
