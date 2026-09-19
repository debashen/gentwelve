import {NextResponse} from "next/server";
import {z} from "zod";
import {DB} from "@/lib/database";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const parsed=z.string().uuid().safeParse((await params).id);if(!parsed.success)return new NextResponse(null,{status:404});
 try{const file=await DB.prepare("SELECT bytes,content_type FROM marketing_assets WHERE id=?::uuid").bind(parsed.data).first<{bytes:Buffer;content_type:string}>();if(!file)return new NextResponse(null,{status:404});return new NextResponse(new Uint8Array(file.bytes),{headers:{"Content-Type":file.content_type,"Cache-Control":"public,max-age=31536000,immutable","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}})}catch{return new NextResponse(null,{status:503})}
}
