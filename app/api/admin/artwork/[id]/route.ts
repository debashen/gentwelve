import {NextResponse} from "next/server";
import {z} from "zod";
import {DB} from "@/lib/database";
import {admin,fail,noStore} from "@/lib/sales/http";
import {SalesError} from "@/lib/sales/store";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 await admin(request);const id=z.string().uuid().parse((await params).id);
 const file=await DB.prepare("SELECT filename,bytes FROM sales_artwork WHERE id=?::uuid").bind(id).first<{filename:string;bytes:Buffer}>();if(!file)throw new SalesError("Artwork not found.",404);
 return new NextResponse(new Uint8Array(file.bytes),{headers:{...noStore,"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename="${file.filename.replace(/["\\]/g,"_")}"`,"Content-Security-Policy":"sandbox; default-src 'none'","X-Content-Type-Options":"nosniff"}});
}catch(e){return fail(e)}}
