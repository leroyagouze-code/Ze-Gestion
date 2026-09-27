-- Journal d'audit en ajout seul : aucune modification ni suppression possible, même par erreur applicative.
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs est en ajout seul';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
--> statement-breakpoint
-- Les paiements ne sont jamais supprimés : on les annule.
CREATE OR REPLACE FUNCTION payments_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Un paiement ne peut pas être supprimé : il doit être annulé';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION payments_no_delete();
