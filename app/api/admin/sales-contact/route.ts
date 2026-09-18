import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { env } from "@/lib/runtime";
import { getSalesContact } from "@/lib/sales-contact";
import { salesContactSchema } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  if (!await getChatGPTUser()) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  try { return NextResponse.json(await getSalesContact(), { headers }); }
  catch { return NextResponse.json({ error: "Could not load sales contact. Please retry." }, { status: 503, headers }); }
}
export async function PUT(request: Request) {
  if (!await getChatGPTUser()) return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = salesContactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a contact name (1–80 characters) and an international WhatsApp number (8–15 digits, including country code)." }, { status: 400 });
  try {
    await env.DB.prepare("INSERT INTO sales_contacts (id,contact_name,whatsapp_number) VALUES ('default',?,?) ON CONFLICT (id) DO UPDATE SET contact_name=excluded.contact_name,whatsapp_number=excluded.whatsapp_number,updated_at=now()").bind(parsed.data.contactName, parsed.data.whatsappNumber).run();
    return NextResponse.json(parsed.data, { headers });
  } catch { return NextResponse.json({ error: "Could not save sales contact. Please retry." }, { status: 503, headers }); }
}
