"use client";
export async function api(path:string,method="GET",body?:unknown){
  const response=await fetch(`/api/admin/sales/${path}`,{method,cache:"no-store",headers:body?{"content-type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await response.json();if(!response.ok)throw new Error(data.error||"Request failed.");return data;
}
export function Field({label,value,onChange,type="text",multiline=false,required=false}:{label:string;value:string|number;onChange:(value:string)=>void;type?:string;multiline?:boolean;required?:boolean}){return <label>{label}{multiline?<textarea value={value} onChange={e=>onChange(e.target.value)}/>:<input required={required} type={type} value={value} onChange={e=>onChange(e.target.value)}/>}</label>}
export function Notice({error,notice}:{error?:string;notice?:string}){return <>{error&&<p className="sales-error" role="alert">{error}</p>}{notice&&<p className="sales-notice" role="status">{notice}</p>}</>}
