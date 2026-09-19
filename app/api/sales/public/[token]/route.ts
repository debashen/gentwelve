import {NextResponse} from "next/server";
import {z} from "zod";
import {getPublicDocument,decideQuote} from "@/lib/sales/documents";
import {fail,jsonBody,noStore} from "@/lib/sales/http";
import {renderDocumentPdf} from "@/lib/sales/pdf";
import { documentPaymentOptions,documentPaid } from "@/lib/sales/payments";
export const dynamic="force-dynamic";
type Context={params:Promise<{token:string}>};
export async function GET(request:Request,context:Context){try{const doc=await getPublicDocument((await context.params).token);const pdf=await renderDocumentPdf(doc,await documentPaid(doc),await documentPaymentOptions(doc));return new NextResponse(new Uint8Array(pdf),{headers:{...noStore,"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${doc.number}.pdf"`}})}catch(e){return fail(e)}}
export async function POST(request:Request,context:Context){try{const input=z.object({decision:z.enum(["accepted","declined"]),name:z.string().trim().min(1).max(200),confirmed:z.literal(true)}).strict().parse(await jsonBody(request));return NextResponse.json(await decideQuote((await context.params).token,input.decision,input.name),{headers:noStore})}catch(e){return fail(e)}}
