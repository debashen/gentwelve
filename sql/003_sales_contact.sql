-- Named contacts allow future expansion; only the default is used today.
CREATE TABLE sales_contacts (
  id TEXT PRIMARY KEY,
  contact_name TEXT NOT NULL CHECK (length(contact_name) BETWEEN 1 AND 80),
  whatsapp_number TEXT NOT NULL CHECK (whatsapp_number ~ '^[1-9][0-9]{7,14}$'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO sales_contacts (id, contact_name, whatsapp_number)
VALUES ('default', 'Debashen', '27690451055');
