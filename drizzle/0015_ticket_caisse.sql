ALTER TABLE "sales" ADD COLUMN "tendered_amount" numeric(18, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "change_amount" numeric(18, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "sales" SET "tendered_amount" = "paid_amount";