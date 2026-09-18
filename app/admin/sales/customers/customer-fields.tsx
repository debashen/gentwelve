"use client";
import type { Customer } from "@/lib/sales/validation";
import { Field } from "../ui";
export const emptyCustomer:Customer={name:"",contactPerson:"",email:"",mobile:"",telephone:"",billingAddress:"",deliveryAddress:"",registrationNumber:"",vatNumber:"",notes:""};
export default function CustomerFields({value,onChange}:{value:Customer;onChange:(value:Customer)=>void}){
 return <div className="sales-form">{Object.entries({name:"Customer / Company Name",contactPerson:"Contact Person",email:"Email",mobile:"Mobile / WhatsApp",telephone:"Telephone",registrationNumber:"Registration Number",vatNumber:"VAT Number",billingAddress:"Billing Address",deliveryAddress:"Delivery Address",notes:"Internal Notes"}).map(([key,label])=><Field key={key} label={label} value={value[key as keyof Customer]} required={key==="name"} type={key==="email"?"email":"text"} multiline={/Address|notes/.test(key)} onChange={text=>onChange({...value,[key]:text})}/>)}</div>;
}
