import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { SalesError } from "./store";
export const noStore={"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"};
export async function admin(request:Request){
  const user=await getChatGPTUser();if(!user)throw new SalesError("Not authorised",401);
  const origin=request.headers.get("origin");
  if(request.method!=="GET"&&origin&&new URL(origin).host!==(request.headers.get("host")||new URL(request.url).host))throw new SalesError("Invalid request origin.",403);
  return user.userId;
}
export function fail(error:unknown){
  if(error instanceof ZodError)return NextResponse.json({error:error.issues.map(i=>`${i.path.join(".")}: ${i.message}`).join("; ")},{status:400,headers:noStore});
  return NextResponse.json({error:error instanceof SalesError?error.message:"Unable to complete the sales request. Please retry."},{status:error instanceof SalesError?error.status:503,headers:noStore});
}
export async function jsonBody(request:Request){
  const raw=await request.text();if(raw.length>1000000)throw new SalesError("Request too large.",413);
  try{return JSON.parse(raw)}catch{throw new SalesError("Invalid JSON.")}
}
