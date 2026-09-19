import {NextResponse} from "next/server";
import {z} from "zod";
import {fail,jsonBody,noStore} from "@/lib/sales/http";
import {startPayment} from "@/lib/sales/payments";
import {siteUrl} from "@/lib/site-url";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{token:string}>}){try{const {provider}=z.object({provider:z.enum(["paystack","payfast","ozow"])}).strict().parse(await jsonBody(request));const checkout=await startPayment((await context.params).token,provider,siteUrl);return NextResponse.json(checkout,{headers:noStore})}catch(e){return fail(e)}}
