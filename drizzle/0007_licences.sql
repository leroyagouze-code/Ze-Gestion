CREATE TABLE "license_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"install_id" text NOT NULL,
	"plan" text NOT NULL,
	"expires_at" timestamp with time zone,
	"customer" text,
	"code" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "license_code" text;--> statement-breakpoint
ALTER TABLE "license_issues" ADD CONSTRAINT "license_issues_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;