CREATE TABLE sales_documents (
  id UUID PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('quote','order','invoice','delivery')),
  number TEXT UNIQUE,
  sequence_number BIGINT,
  customer_id UUID NOT NULL REFERENCES sales_customers(id),
  quote_id UUID REFERENCES sales_documents(id),
  order_id UUID REFERENCES sales_documents(id),
  enquiry_id UUID REFERENCES sales_enquiries(id),
  salesperson_id TEXT NOT NULL REFERENCES sales_contacts(id),
  status TEXT NOT NULL DEFAULT 'draft',
  snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  total_cents BIGINT NOT NULL CHECK(total_cents>=0),
  currency TEXT NOT NULL DEFAULT 'ZAR' CHECK(currency='ZAR'),
  public_token TEXT NOT NULL UNIQUE,
  expires_on DATE,
  due_on DATE,
  issued_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK((number IS NULL AND issued_at IS NULL) OR (number IS NOT NULL AND issued_at IS NOT NULL)),
  CHECK((kind='quote' AND status IN ('draft','sent','viewed','accepted','declined','expired','converted','cancelled')) OR
        (kind='order' AND status IN ('pending_payment','paid','artwork_required','artwork_approval','ready_for_production','in_production','ready_for_dispatch','dispatched','completed','cancelled')) OR
        (kind='invoice' AND status IN ('draft','issued','cancelled')) OR
        (kind='delivery' AND status IN ('issued','cancelled')))
);
CREATE UNIQUE INDEX sales_one_order_per_quote ON sales_documents(quote_id) WHERE kind='order';
CREATE UNIQUE INDEX sales_one_invoice_per_order ON sales_documents(order_id) WHERE kind='invoice';
CREATE INDEX sales_documents_customer ON sales_documents(customer_id,created_at DESC);
CREATE INDEX sales_documents_kind_status ON sales_documents(kind,status,created_at DESC);
CREATE INDEX sales_documents_order ON sales_documents(order_id);
CREATE FUNCTION protect_sales_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Sales documents must be cancelled, not deleted'; END IF;
 IF OLD.number IS NOT NULL AND (NEW.number IS DISTINCT FROM OLD.number OR NEW.sequence_number IS DISTINCT FROM OLD.sequence_number OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.total_cents IS DISTINCT FROM OLD.total_cents OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.salesperson_id IS DISTINCT FROM OLD.salesperson_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.quote_id IS DISTINCT FROM OLD.quote_id OR NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.issued_at IS DISTINCT FROM OLD.issued_at OR NEW.expires_on IS DISTINCT FROM OLD.expires_on OR NEW.due_on IS DISTINCT FROM OLD.due_on) THEN
  RAISE EXCEPTION 'Issued document content is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sales_document_immutable BEFORE UPDATE OR DELETE ON sales_documents FOR EACH ROW EXECUTE FUNCTION protect_sales_document();
