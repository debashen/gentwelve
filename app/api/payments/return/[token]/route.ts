import {NextResponse} from "next/server";
import {siteUrl} from "@/lib/site-url";
// Browser returns are navigation only; they never write payment status.
async function back(_request:Request,context:{params:Promise<{token:string}>}){const {token}=await context.params;if(!/^[a-f0-9]{64}$/.test(token))return new NextResponse("Not found",{status:404});return NextResponse.redirect(new URL(`/pay/${token}`,siteUrl),{status:303,headers:{"Cache-Control":"no-store"}})}
export const GET=back;
export const POST=back;
