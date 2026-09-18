import {z} from "zod";
const cents=z.number().int().min(0).max(100000000);
export const lineSchema=z.object({productCode:z.string().max(200).default(""),description:z.string().trim().min(1).max(1500),colour:z.string().max(100).default(""),size:z.string().max(100).default(""),unitPriceCents:cents,quantity:z.number().int().min(1).max(1000000),discountBps:z.number().int().min(0).max(10000).default(0),brandingCents:cents.default(0),setupCents:cents.default(0),otherCents:cents.default(0),taxable:z.boolean().default(true)}).strict();
export type Line=z.infer<typeof lineSchema>;
export function calculate(lines:Line[],deliveryCents:number,vatRegistered:boolean,vatRateBps:number){
 const rows=lines.map(line=>{const base=line.unitPriceCents*line.quantity;const discount=Math.round(base*line.discountBps/10000);const charges=line.brandingCents*line.quantity+line.setupCents+line.otherCents;const net=base-discount+charges;const tax=vatRegistered&&line.taxable?Math.round(net*vatRateBps/10000):0;return {...line,baseCents:base,discountCents:discount,netCents:net,taxCents:tax,totalCents:net+tax}});
 const subtotalCents=rows.reduce((n,r)=>n+r.baseCents+r.brandingCents*r.quantity+r.setupCents+r.otherCents,0);
 const discountCents=rows.reduce((n,r)=>n+r.discountCents,0);
 const taxCents=rows.reduce((n,r)=>n+r.taxCents,0)+(vatRegistered?Math.round(deliveryCents*vatRateBps/10000):0);
 const totalCents=subtotalCents-discountCents+deliveryCents+taxCents;
 if(!Number.isSafeInteger(totalCents)||totalCents>100000000000)throw new Error("Document value exceeds the supported limit.");
 return {lines:rows,subtotalCents,discountCents,deliveryCents,taxCents,totalCents};
}
export type Totals=ReturnType<typeof calculate>;
