"use client";
import {useState} from "react";
export default function Decision({token}:{token:string}){
 const[name,setName]=useState(""),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function decide(decision:string){setBusy(true);setError("");try{const r=await fetch(`/api/sales/public/${token}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({decision,name,confirmed})});const data=await r.json();if(!r.ok)throw new Error(data.error);window.location.reload()}catch(e){setError((e as Error).message);setBusy(false)}}
 return <section className="sales-panel"><h2>Your decision</h2><label className="sales-field">Your name<input value={name} maxLength={200} onChange={e=>setName(e.target.value)}/></label><label className="sales-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I am authorised to respond to this quotation and have reviewed its details and terms.</label><div className="sales-actions"><button disabled={busy||!confirmed||!name.trim()} onClick={()=>decide("accepted")}>Accept quotation</button><button className="secondary" disabled={busy||!confirmed||!name.trim()} onClick={()=>decide("declined")}>Decline quotation</button></div>{error&&<p role="alert">{error}</p>}</section>;
}
