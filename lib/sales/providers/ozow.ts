import type {PaymentAdapter} from "./types";
import {decimalCents,equalSignature,formFields,ozowHash,ozowRequestOrder,ozowResponseOrder,providerFetch} from "./security";
export const ozow:PaymentAdapter={
 configured:()=>Boolean(process.env.OZOW_SITE_CODE&&process.env.OZOW_PRIVATE_KEY&&process.env.OZOW_API_KEY),testMode:()=>process.env.OZOW_TEST_MODE==="true",
 async start(input){
  const fields:Record<string,string>={SiteCode:process.env.OZOW_SITE_CODE!,CountryCode:"ZA",CurrencyCode:"ZAR",Amount:(input.amountCents/100).toFixed(2),TransactionReference:input.reference,BankReference:input.orderNumber.slice(0,20),Optional1:"",Optional2:"",Optional3:"",Optional4:"",Optional5:"",Customer:input.customerName.slice(0,100),CancelUrl:input.returnUrl,ErrorUrl:input.returnUrl,SuccessUrl:input.returnUrl,NotifyUrl:input.notifyUrl,IsTest:String(input.testMode)};
  fields.HashCheck=ozowHash(fields,ozowRequestOrder,process.env.OZOW_PRIVATE_KEY!);return {type:"form",url:"https://pay.ozow.com",fields};
 },
 async verify(raw){
  const fields=formFields(raw);const secret=process.env.OZOW_PRIVATE_KEY;if(!secret)throw new Error("Unconfigured provider");
  if(!equalSignature(ozowHash(fields,ozowResponseOrder,secret),fields.Hash||""))throw new Error("Invalid signature");
  if(fields.SiteCode!==process.env.OZOW_SITE_CODE)throw new Error("Wrong site");
  if(fields.Status!=="Complete")return null;
  // Test notifications are never credited as real money. Ozow does not send them in test mode.
  if(fields.IsTest!=="false")throw new Error("Test notification not accepted");
  const params=new URLSearchParams({siteCode:fields.SiteCode,transactionReference:fields.TransactionReference});
  const data=await(await providerFetch(`https://api.ozow.com/GetTransactionByReference?${params}`,{headers:{ApiKey:process.env.OZOW_API_KEY!,Accept:"application/json"}})).json();
  if(!Array.isArray(data))throw new Error("Payment not verified");
  const p=data.find(row=>row.transactionId===fields.TransactionId||row.TransactionId===fields.TransactionId);if(!p)throw new Error("Payment not verified");
  const value=(key:string)=>p[key]??p[key[0].toLowerCase()+key.slice(1)];
  if(value("Status")!=="Complete"||value("SiteCode")!==fields.SiteCode||value("TransactionReference")!==fields.TransactionReference||decimalCents(value("Amount"))!==decimalCents(fields.Amount)||value("CurrencyCode")!==fields.CurrencyCode)throw new Error("Payment mismatch");
  return {reference:fields.TransactionReference,providerReference:fields.TransactionId,amountCents:decimalCents(fields.Amount),currency:fields.CurrencyCode,status:"succeeded",testMode:false,paidAt:value("PaymentDate")||null};
 }
};
