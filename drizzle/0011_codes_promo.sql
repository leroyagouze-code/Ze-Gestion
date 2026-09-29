CREATE TABLE "platform_promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"kind" text NOT NULL,
	"value" numeric(18, 2) NOT NULL,
	"scope" text DEFAULT 'all' NOT NULL,
	"plans" text[] DEFAULT '{}'::text[] NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_promo_codes_uses_ck" CHECK ("platform_promo_codes"."used_count" >= 0 and ("platform_promo_codes"."max_uses" is null or "platform_promo_codes"."used_count" <= "platform_promo_codes"."max_uses"))
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"kind" text NOT NULL,
	"value" numeric(18, 2) NOT NULL,
	"min_purchase" numeric(18, 2),
	"starts_on" date,
	"ends_on" date,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_uses_ck" CHECK ("promo_codes"."used_count" >= 0 and ("promo_codes"."max_uses" is null or "promo_codes"."used_count" <= "promo_codes"."max_uses"))
);
--> statement-breakpoint
ALTER TABLE "license_orders" ADD COLUMN "promo_code_id" uuid;--> statement-breakpoint
ALTER TABLE "license_orders" ADD COLUMN "promo_code" text;--> statement-breakpoint
ALTER TABLE "license_orders" ADD COLUMN "list_amount" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "license_orders" ADD COLUMN "discount_amount" numeric(18, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "promo_code_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "promo_code" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "promo_discount" numeric(18, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD COLUMN "promo_code_id" uuid;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD COLUMN "promo_code" text;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD COLUMN "discount_amount" numeric(18, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_promo_codes" ADD CONSTRAINT "platform_promo_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_promo_codes_code_uq" ON "platform_promo_codes" USING btree (upper("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "promo_codes_company_code_uq" ON "promo_codes" USING btree ("company_id",upper("code"));--> statement-breakpoint
ALTER TABLE "license_orders" ADD CONSTRAINT "license_orders_promo_code_id_platform_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."platform_promo_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_promo_code_id_platform_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."platform_promo_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Codes promo des entreprises : isolés par company_id comme les autres tables métier
ALTER TABLE "promo_codes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "promo_codes" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
-- Nouvelle permission « Gérer les codes promo » : donnée aux rôles qui modifiaient déjà les paramètres
-- (l'Administrateur la reçoit de toute façon à la connexion, voir loadContext).
UPDATE "roles" SET "permissions" = array_append("permissions", 'promos.manage')
WHERE 'settings.manage' = ANY("permissions") AND NOT ('promos.manage' = ANY("permissions"));
