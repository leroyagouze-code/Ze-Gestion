ALTER TABLE "companies" ADD COLUMN "allow_negative_stock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_changed_at" timestamp with time zone;--> statement-breakpoint
-- Les entreprises existantes gardent leur fonctionnement actuel (vente possible sans stock) ; les nouvelles bloquent par défaut.
UPDATE "companies" SET "allow_negative_stock" = true;
