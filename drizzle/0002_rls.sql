-- Contexte de requête posé par withTenant() : set_config('app.company_id', ..., true)
CREATE OR REPLACE FUNCTION app_company_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.company_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "roles" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "stores" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "taxes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "taxes" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "payment_methods" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "payment_methods" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "document_sequences" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "document_sequences" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "categories" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "brands" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "brands" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "suppliers" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "products" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "stock_levels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "stock_levels" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "stock_movements" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "customers" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sales" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "sale_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sale_items" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "invoices" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "invoice_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "invoice_items" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "payments" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "expenses" USING (company_id = app_company_id()) WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
-- Un utilisateur voit aussi ses propres adhésions (liste de ses entreprises à la connexion)
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "memberships"
  USING (company_id = app_company_id() OR user_id = app_user_id())
  WITH CHECK (company_id = app_company_id());
--> statement-breakpoint
-- Journal d'audit : lecture limitée à l'entreprise courante, ajout seul
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_read ON "audit_logs" FOR SELECT USING (company_id = app_company_id());
--> statement-breakpoint
CREATE POLICY audit_append ON "audit_logs" FOR INSERT WITH CHECK (company_id IS NULL OR company_id = app_company_id() OR app_user_id() IS NOT NULL);
--> statement-breakpoint
-- Page publique de facture : résout l'entreprise à partir du jeton sans exposer les autres lignes
CREATE OR REPLACE FUNCTION public_invoice_company(token text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM invoices WHERE public_token = token
$$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT USAGE ON SCHEMA public TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
    REVOKE UPDATE, DELETE ON audit_logs FROM app_user;
    GRANT EXECUTE ON FUNCTION public_invoice_company(text) TO app_user;
  END IF;
END $$;
