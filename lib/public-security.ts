import {createHmac} from "node:crypto";
import {DB} from "./database";
import {SalesError} from "./sales/store";
export function sameOrigin(request:Request){
 const origin=request.headers.get("origin");
 if(!origin||new URL(origin).host!==(request.headers.get("host")||new URL(request.url).host))throw new SalesError("Invalid request origin.",403);
}
export async function limitPublicRequest(request:Request,scope:string,max:number){
 const ip=(request.headers.get("x-vercel-forwarded-for")||request.headers.get("x-forwarded-for")||"local").split(",")[0].trim();
 const secret=process.env.AUTH_SECRET;if(!secret)throw new SalesError("Service unavailable.",503);
 const key=scope+":"+createHmac("sha256",secret).update(ip).digest("hex");
 const row=await DB.prepare(`INSERT INTO public_rate_limits(key,bucket,hits) VALUES(?,date_trunc('hour',now()),1) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN public_rate_limits.bucket=date_trunc('hour',now()) THEN public_rate_limits.hits+1 ELSE 1 END,bucket=date_trunc('hour',now()) RETURNING hits`).bind(key).first<{hits:number}>();
 if((row?.hits||0)>max)throw new SalesError("Too many requests. Please try again later or contact sales.",429);
}
export async function limitedBody(request:Request,maxBytes:number){
 if(Number(request.headers.get("content-length")||0)>maxBytes)throw new SalesError("Request too large.",413);
 const reader=request.body?.getReader();if(!reader)throw new SalesError("Empty request.");
 const chunks:Uint8Array[]=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw new SalesError("Request too large.",413)}chunks.push(value)}return Buffer.concat(chunks);
}
