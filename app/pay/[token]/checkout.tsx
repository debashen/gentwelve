"use client";
import {useState} from "react";
import type {Checkout} from "@/lib/sales/providers/types";
export default function CheckoutButtons({token,methods}:{token:string;methods:string[]}){
 const[busy,setBusy]=useState(""),[error,setError]=useState("");
 async function start(provider:string){setBusy(provider);setError("");try{const response=await fetch(`/api/payments/${token}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({provider})});const data=await response.json();if(!response.ok)throw new Error(data.error);const checkout=data as Checkout;
 if(checkout.type==="redirect")window.location.assign(checkout.url);
 else if(checkout.type==="form"){const form=document.createElement("form");form.method="POST";form.action=checkout.url;for(const [key,value] of Object.entries(checkout.fields)){const input=document.createElement("input");input.type="hidden";input.name=key;input.value=value;form.appendChild(input)}document.body.appendChild(form);form.submit()}
 else{await new Promise<void>((resolve,reject)=>{const script=document.createElement("script");script.src=checkout.scriptUrl;script.onload=()=>resolve();script.onerror=()=>reject(new Error("Payment window could not load."));document.head.appendChild(script)});const payfast=(window as typeof window & {payfast_do_onsite_payment?:(data:{uuid:string},callback:()=>void)=>void}).payfast_do_onsite_payment;if(!payfast)throw new Error("Payment window unavailable.");payfast({uuid:checkout.uuid},()=>window.location.reload());setBusy("")}
 }catch(e){setError((e as Error).message);setBusy("")}}
 return <><div className="sales-actions">{methods.filter(m=>m!=="eft").map(m=><button disabled={!!busy} key={m} onClick={()=>start(m)}>{busy===m?"Opening…":{paystack:"Paystack",payfast:"PayFast",ozow:"Ozow"}[m]}</button>)}{methods.includes("eft")&&<a className="sales-button" href="#eft">Manual EFT</a>}</div>{error&&<p role="alert" className="sales-error">{error}</p>}</>;
}
