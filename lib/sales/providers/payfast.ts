import {resolve4} from "node:dns/promises";
import type {PaymentAdapter} from "./types";
import {decimalCents,equalSignature,formFields,payfastPayload,payfastSignature,providerFetch} from "./security";
const origin=()=>process.env.PAYFAST_SANDBOX==="true"?"https://sandbox.payfast.co.za":"https://www.payfast.co.za";
export const payfast:PaymentAdapter={
 configured:()=>["true","false"].includes(process.env.PAYFAST_SANDBOX||"")&&Boolean(process.env.PAYFAST_MERCHANT_ID&&process.env.PAYFAST_MERCHANT_KEY&&process.env.PAYFAST_PASSPHRASE),testMode:()=>process.env.PAYFAST_SANDBOX==="true",
 async start(input){
  if(!input.email)throw new Error("Customer email required");
  // Onsite initialization keeps merchant credentials entirely on the server.
  const fields:Record<string,string>={merchant_id:process.env.PAYFAST_MERCHANT_ID!,merchant_key:process.env.PAYFAST_MERCHANT_KEY!,return_url:input.returnUrl,cancel_url:input.returnUrl,notify_url:input.notifyUrl,name_first:input.customerName.slice(0,100),email_address:input.email,m_payment_id:input.reference,amount:(input.amountCents/100).toFixed(2),item_name:input.orderNumber.slice(0,100)};
  fields.signature=payfastSignature(fields,process.env.PAYFAST_PASSPHRASE!);
  const data=await(await providerFetch(`${origin()}/onsite/process`,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams(fields)})).json();
  if(typeof data.uuid!=="string"||!/^[a-z0-9-]+$/i.test(data.uuid))throw new Error("Provider initialization failed");return {type:"payfast",uuid:data.uuid,scriptUrl:`${origin()}/onsite/engine.js`};
 },
 async verify(raw,headers){
  const fields=formFields(raw);const passphrase=process.env.PAYFAST_PASSPHRASE;if(!passphrase)throw new Error("Unconfigured provider");
  if(!equalSignature(payfastSignature(fields,passphrase),fields.signature||""))throw new Error("Invalid signature");
  if(fields.merchant_id!==process.env.PAYFAST_MERCHANT_ID)throw new Error("Wrong merchant");
  // Vercel overwrites forwarded-for with the connecting IP. Never trust arbitrary proxies.
  if(process.env.VERCEL){const source=(headers.get("x-vercel-forwarded-for")||headers.get("x-forwarded-for")||"").split(",")[0].trim();const results=await Promise.all(["www.payfast.co.za","w1w.payfast.co.za","w2w.payfast.co.za","sandbox.payfast.co.za"].map(host=>resolve4(host).catch(()=>[])));if(!results.flat().includes(source))throw new Error("Invalid notification origin")}
  const validation=await providerFetch(`${origin()}/eng/query/validate`,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:payfastPayload(fields)});if((await validation.text()).trim()!=="VALID")throw new Error("Payment not verified");
  if(fields.payment_status!=="COMPLETE")return null;
  return {reference:fields.m_payment_id,providerReference:fields.pf_payment_id,amountCents:decimalCents(fields.amount_gross),currency:"ZAR",status:"succeeded",testMode:process.env.PAYFAST_SANDBOX==="true",paidAt:null};
 }
};
