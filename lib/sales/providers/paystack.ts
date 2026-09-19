import {createHmac} from "node:crypto";
import type {PaymentAdapter} from "./types";
import {equalSignature,providerFetch} from "./security";
export const paystack:PaymentAdapter={
 configured:()=>Boolean(process.env.PAYSTACK_SECRET_KEY),testMode:()=>!process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_"),
 async start(input){
  if(!input.email)throw new Error("Customer email required");
  const response=await providerFetch("https://api.paystack.co/transaction/initialize",{method:"POST",headers:{Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`,"content-type":"application/json"},body:JSON.stringify({email:input.email,amount:input.amountCents,currency:"ZAR",reference:input.reference,callback_url:input.returnUrl})});
  const data=await response.json();if(!data.status||!data.data?.authorization_url)throw new Error("Provider initialization failed");
  const url=new URL(data.data.authorization_url);if(url.protocol!=="https:"||url.hostname!=="checkout.paystack.com")throw new Error("Invalid checkout URL");return {type:"redirect",url:url.href};
 },
 async verify(raw,headers){
  const secret=process.env.PAYSTACK_SECRET_KEY;if(!secret)throw new Error("Unconfigured provider");
  if(!equalSignature(createHmac("sha512",secret).update(raw).digest("hex"),headers.get("x-paystack-signature")||""))throw new Error("Invalid signature");
  const event=JSON.parse(raw);if(event.event!=="charge.success")return null;
  const ref=event.data?.reference;if(typeof ref!=="string"||ref.length>100)throw new Error("Invalid reference");
  const result=await(await providerFetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`,{headers:{Authorization:`Bearer ${secret}`}})).json();const p=result.data;
  if(!result.status||p?.status!=="success"||p.reference!==ref||!Number.isSafeInteger(p.amount))throw new Error("Payment not verified");
  return {reference:ref,providerReference:String(p.id),amountCents:p.amount,currency:p.currency,status:"succeeded",testMode:p.domain!=="live",paidAt:p.paid_at||null};
 }
};
