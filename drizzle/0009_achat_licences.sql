CREATE TABLE "license_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"install_id" text NOT NULL,
	"plan" text NOT NULL,
	"duration" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"network" text,
	"provider" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_ref" text,
	"payment_ref" text,
	"failure_reason" text,
	"license_issue_id" uuid,
	"code" text,
	"checked_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "license_orders_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "license_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan" text NOT NULL,
	"duration" text NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "license_orders" ADD CONSTRAINT "license_orders_license_issue_id_license_issues_id_fk" FOREIGN KEY ("license_issue_id") REFERENCES "public"."license_issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "license_orders_install_idx" ON "license_orders" USING btree ("install_id","created_at");--> statement-breakpoint
CREATE INDEX "license_orders_status_idx" ON "license_orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "license_prices_plan_duration_idx" ON "license_prices" USING btree ("plan","duration");--> statement-breakpoint
-- Tarifs de départ, calculés sur le prix mensuel des formules en ligne ; modifiables dans Super admin > Licences
INSERT INTO "license_prices" ("plan", "duration", "amount", "currency")
SELECT p.code, d.duration, p.monthly_price * d.factor, p.currency
FROM plans p
CROSS JOIN (VALUES ('1', 1), ('3', 3), ('6', 6), ('12', 10), ('life', 30)) AS d(duration, factor)
WHERE p.code IN ('BASIC', 'PRO', 'BUSINESS')
ON CONFLICT DO NOTHING;
