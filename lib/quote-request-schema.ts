import {z} from "zod";
export const selectionSchema=z.object({
 code:z.string().min(1).max(200),variantCode:z.string().max(200).default(""),quantity:z.number().int().min(1).max(1000000).nullable(),
 branded:z.boolean(),method:z.string().max(200).default(""),position:z.string().max(200).default(""),notes:z.string().max(2000).default("")
}).strict();
export type QuoteSelection=z.infer<typeof selectionSchema>;
export const quoteRequestSchema=z.object({
 requestKey:z.string().uuid(),name:z.string().trim().min(1).max(200),company:z.string().trim().min(1).max(200),email:z.string().email().max(254),mobile:z.string().trim().regex(/^\+?[0-9 ()-]{7,30}$/).refine(v=>{const n=v.replace(/\D/g,"").length;return n>=7&&n<=15},"Enter a valid mobile number"),
 city:z.string().trim().max(300).default(""),requiredBy:z.union([z.literal(""),z.string().date()]).default(""),instructions:z.string().max(3000).default(""),reference:z.string().max(200).default(""),website:z.literal("").default(""),
 campaignId:z.string().uuid().nullable().default(null),items:z.array(selectionSchema).min(1).max(30)
}).strict();
export function quoteWhatsAppMessage(reference:string,items:Array<{name:string;code:string;colour:string;size:string;quantity:number|null;branded:boolean;method:string;position:string}>){
 // Contact details, artwork, customer notes and private links never enter this URL.
 const lines=items.slice(0,8).map(i=>[i.name,`Code: ${i.code}`,[i.colour,i.size].filter(Boolean).join(" / "),`Quantity: ${i.quantity??"Not sure yet"}`,`Branding: ${i.branded?"Yes":"No"}`,i.branded&&i.method?`Method: ${i.method}${i.position?` / ${i.position}`:""}`:""].filter(Boolean).join("\n"));
 return `Hi Gentwelve,\n\nI'd like a quote for the following:\n\n${lines.join("\n\n")}${items.length>8?`\n\nPlus ${items.length-8} more items saved with this request.`:""}\n\nQuote reference: ${reference}\n\nPlease assist me with pricing.`;
}
