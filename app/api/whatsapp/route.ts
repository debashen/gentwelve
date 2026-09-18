import { NextResponse } from "next/server";
import { getSalesContact } from "@/lib/sales-contact";
import { getProductPageData } from "@/lib/catalogue-product";
import { enquirySchema, whatsappUrl } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0" };
export async function GET(request: Request) {
  const url = new URL(request.url);
  // Next may use an internal hostname; preserve the customer-facing request host.
  const productOrigin = new URL(url.origin);
  productOrigin.host = request.headers.get("host") || url.host;
  const parsed = url.searchParams.size ? enquirySchema.safeParse(Object.fromEntries(url.searchParams)) : null;
  if (parsed && !parsed.success) return new NextResponse("Invalid enquiry options. Return to the product and try again.", { status: 400, headers });
  try {
    const contact = await getSalesContact();
    let destination = whatsappUrl(contact);
    if (parsed?.success) {
      const data = await getProductPageData(parsed.data.code);
      if (!data) return new NextResponse("Product unavailable. Please return to the catalogue.", { status: 404, headers });
      destination = whatsappUrl(contact, { ...parsed.data, name: data.product.name, url: new URL(`/product/${encodeURIComponent(data.product.code)}`, productOrigin).href });
    }
    return new NextResponse(null, { status: 302, headers: { ...headers, Location: destination } });
  } catch { return new NextResponse("WhatsApp enquiries are temporarily unavailable. Please go back and retry.", { status: 503, headers }); }
}
