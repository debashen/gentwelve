import { z } from "zod";

const singleLine = z.string().trim().min(1).max(80).regex(/^[^\r\n\x00-\x1f\x7f]+$/);
export const salesContactSchema = z.object({
  contactName: singleLine,
  whatsappNumber: z.string().trim().max(40).regex(/^\+?[0-9 ()-]+$/)
    .transform(value => value.replace(/[+ ()-]/g, ""))
    .pipe(z.string().regex(/^[1-9][0-9]{7,14}$/)),
}).strict();
export type SalesContact = z.infer<typeof salesContactSchema>;
export const brandingOptions = ["Yes", "No", "Not sure"] as const;
export const enquirySchema = z.object({
  code: z.string().min(1).max(200),
  quantity: z.string().regex(/^(Not sure|[1-9][0-9]{0,8}\+?)$/),
  branding: z.enum(brandingOptions),
  colour: singleLine.optional(),
  size: singleLine.optional(),
});
export function enquiryPath(code: string, quantity: string, branding: string, colour = "", size = "") {
  const params = new URLSearchParams({ code, quantity, branding });
  if (colour) params.set("colour", colour);
  if (size) params.set("size", size);
  return `/api/whatsapp?${params}`;
}
export function whatsappUrl(contact: SalesContact, product?: { name: string; code: string; quantity: string; branding: string; url: string; colour?: string; size?: string }) {
  if (!product) return `https://wa.me/${contact.whatsappNumber}`;
  const message = `Hi ${contact.contactName}, I'd like a quote on this product.\n\nProduct: ${product.name}\nCode: ${product.code}\nQuantity: ${product.quantity}\nBranding: ${product.branding}\nProduct Link: ${product.url}`;
  const variants = [product.colour && `Colour: ${product.colour}`, product.size && `Size: ${product.size}`].filter(Boolean);
  return `https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent([message, ...variants].join("\n"))}`;
}
