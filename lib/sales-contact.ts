import { env } from "@/lib/runtime";
import type { SalesContact } from "@/lib/whatsapp";

export async function getSalesContact(): Promise<SalesContact> {
  const contact = await env.DB.prepare("SELECT contact_name AS contactName, whatsapp_number AS whatsappNumber FROM sales_contacts WHERE id='default'").first<SalesContact>();
  if (!contact) throw new Error("Sales contact is not configured.");
  return contact;
}
