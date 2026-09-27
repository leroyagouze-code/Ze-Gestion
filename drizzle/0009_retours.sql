CREATE TABLE "app_installs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"install_id" text NOT NULL,
	"edition" text NOT NULL,
	"version" text,
	"os" text,
	"locale" text,
	"timezone" text,
	"country" text,
	"company_name" text,
	"business_type" text,
	"licensed" boolean DEFAULT false NOT NULL,
	"pings" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_installs_install_id_unique" UNIQUE("install_id")
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "tax_mode" text DEFAULT 'line' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "hidden_modules" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "tax_mode" text DEFAULT 'line' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "tax_mode" text DEFAULT 'line' NOT NULL;