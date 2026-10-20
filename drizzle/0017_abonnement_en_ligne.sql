CREATE TABLE "subscription_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"plan_id" uuid NOT NULL,
	"months" integer NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"list_amount" numeric(18, 2) NOT NULL,
	"discount_amount" numeric(18, 2) DEFAULT 0 NOT NULL,
	"promo_code_id" uuid,
	"promo_code" text,
	"currency" text DEFAULT 'XOF' NOT NULL,
	"phone" text NOT NULL,
	"network" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_ref" text,
	"payment_ref" text,
	"failure_reason" text,
	"payment_id" uuid,
	"checked_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_orders_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "subscription_orders" ADD CONSTRAINT "subscription_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_orders" ADD CONSTRAINT "subscription_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_orders" ADD CONSTRAINT "subscription_orders_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_orders" ADD CONSTRAINT "subscription_orders_promo_code_id_platform_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."platform_promo_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_orders" ADD CONSTRAINT "subscription_orders_payment_id_subscription_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."subscription_payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_orders_company_idx" ON "subscription_orders" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "subscription_orders_status_idx" ON "subscription_orders" USING btree ("status","created_at");