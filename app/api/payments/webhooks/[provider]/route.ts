import {NextResponse} from "next/server";
import {adapters} from "@/lib/sales/providers";
import type {OnlineProvider} from "@/lib/sales/providers/types";
import {receivePayment} from "@/lib/sales/payments";
import {fail,noStore} from "@/lib/sales/http";
export const dynamic="force-dynamic";
export async function POST(request:Request,context:{params:Promise<{provider:string}>}){
 const {provider}=await context.params;if(!Object.hasOwn(adapters,provider))return new NextResponse("Not found",{status:404});
 const adapter=adapters[provider as OnlineProvider];if(!adapter.configured())return new NextResponse("Provider unavailable",{status:503});
 const raw=await request.text();if(raw.length>100000)return new NextResponse("Too large",{status:413});
 let verified;try{verified=await adapter.verify(raw,request.headers)}catch{return new NextResponse("Notification could not be verified",{status:400,headers:noStore})}
 try{if(verified)await receivePayment(provider as OnlineProvider,verified);return NextResponse.json({received:true},{headers:noStore})}catch(e){return fail(e)}
}
