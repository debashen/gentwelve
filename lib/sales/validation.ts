import { z } from "zod";
const text = (max=200) => z.string().trim().max(max).default("");
export const customerSchema = z.object({
  name: z.string().trim().min(1).max(200), contactPerson:text(), email:z.union([z.literal(""),z.string().email().max(254)]).default(""),
  mobile:text(40),telephone:text(40),billingAddress:text(1500),deliveryAddress:text(1500),registrationNumber:text(100),vatNumber:text(100),notes:text(5000),
}).strict();
export type Customer = z.infer<typeof customerSchema>;
export const businessSchema = z.object({
  legalName:text(),tradingName:text().default("Gentwelve Printing Co"),registrationNumber:text(100),vatRegistered:z.boolean().default(false),vatNumber:text(100),vatRateBps:z.number().int().min(0).max(10000).default(0),
  email:z.union([z.literal(""),z.string().email().max(254)]).default(""),telephone:text(40),whatsapp:text(40),website:text(300),address:text(1500),
  logoUrl:z.string().max(700000).refine(value=>["/gentwelve-document-logo.png","/gentwelve-web-logo.svg"].includes(value)||/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value),"Upload a PNG or JPEG logo").default("/gentwelve-document-logo.png"),
  quoteValidityDays:z.number().int().min(1).max(365).default(30),quoteTerms:text(10000),invoiceTerms:text(10000),paymentTerms:text(10000),deliveryTerms:text(10000),
  bank:text(),accountName:text(),accountNumber:text(50),accountType:text(80),branchCode:text(20),defaultSalespersonId:z.string().min(1).max(80).default("default"),
  providers:z.object({paystack:z.boolean().default(false),payfast:z.boolean().default(false),ozow:z.boolean().default(false),eft:z.boolean().default(false)}).strict().default({}),
}).strict().superRefine((value,ctx)=>{
  if(value.vatRegistered&&(!value.vatNumber||!value.vatRateBps))ctx.addIssue({code:"custom",path:["vatNumber"],message:"VAT number and rate are required when VAT is enabled."});
  if(value.providers.eft&&(!value.bank||!value.accountName||!value.accountNumber||!value.branchCode))ctx.addIssue({code:"custom",path:["bank"],message:"Complete banking details before enabling EFT."});
});
export type Business = z.infer<typeof businessSchema>;
export const defaultBusiness = businessSchema.parse({});
export const sequenceSchema=z.array(z.object({kind:z.enum(["quote","order","invoice","delivery"]),prefix:z.string().regex(/^[A-Z][A-Z0-9-]{0,15}$/),nextNumber:z.number().int().min(1).max(999999999)}).strict()).length(4).refine(rows=>new Set(rows.map(r=>r.kind)).size===4&&new Set(rows.map(r=>r.prefix)).size===4,"Kinds and prefixes must be unique.");
export const enquiryInput=z.object({customerId:z.string().uuid().nullable().default(null),contactName:text(),source:z.enum(["manual","whatsapp","product"]).default("manual"),productCode:text(),quantity:text(30),branding:text(80),notes:text(5000)}).strict();
export const money = (cents:number) => new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"}).format(cents/100);
