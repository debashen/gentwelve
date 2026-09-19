CREATE TABLE sales_payments (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES sales_documents(id),
  invoice_id UUID REFERENCES sales_documents(id),
  provider TEXT NOT NULL CHECK(provider IN ('paystack','payfast','ozow','eft')),
  reference TEXT NOT NULL UNIQUE,
  provider_reference TEXT,
  amount_cents BIGINT NOT NULL CHECK(amount_cents>0),
  currency TEXT NOT NULL DEFAULT 'ZAR' CHECK(currency='ZAR'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','succeeded','failed','cancelled')),
  test_mode BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider,provider_reference)
);
CREATE INDEX sales_payments_order ON sales_payments(order_id,status);
CREATE INDEX sales_payments_invoice ON sales_payments(invoice_id);
CREATE FUNCTION protect_sales_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment records cannot be deleted'; END IF;
 IF OLD.status='succeeded' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents OR NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.provider IS DISTINCT FROM OLD.provider OR NEW.reference IS DISTINCT FROM OLD.reference OR NEW.test_mode IS DISTINCT FROM OLD.test_mode OR NEW.paid_at IS DISTINCT FROM OLD.paid_at OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference) THEN RAISE EXCEPTION 'Received payments are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sales_payment_immutable BEFORE UPDATE OR DELETE ON sales_payments FOR EACH ROW EXECUTE FUNCTION protect_sales_payment();
CREATE VIEW sales_document_summary AS
SELECT d.*,
 COALESCE(p.paid_cents,0) AS paid_cents,
 CASE WHEN d.status='cancelled' THEN 'cancelled'
      WHEN d.kind='quote' AND d.status IN ('sent','viewed') AND d.expires_on<CURRENT_DATE THEN 'expired'
      WHEN d.kind='invoice' AND d.number IS NOT NULL AND COALESCE(p.paid_cents,0)>=d.total_cents THEN 'paid'
      WHEN d.kind='invoice' AND d.number IS NOT NULL AND COALESCE(p.paid_cents,0)>0 THEN 'partially_paid'
      WHEN d.kind='invoice' AND d.number IS NOT NULL AND d.due_on<CURRENT_DATE THEN 'overdue'
      ELSE d.status END AS effective_status
FROM sales_documents d
LEFT JOIN LATERAL (SELECT SUM(amount_cents) AS paid_cents FROM sales_payments WHERE order_id=CASE WHEN d.kind='order' THEN d.id ELSE d.order_id END AND status='succeeded' AND test_mode=false) p ON true;
