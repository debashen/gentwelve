"use client";
import {useEffect,useRef,useState} from "react";
import {popupEligible,type CampaignRecord} from "@/lib/campaigns";
import "./campaigns.css";
function track(id:string,event:string,productCode?:string){try{let visitor=sessionStorage.getItem("gentwelve_campaign_visitor");if(!visitor){visitor=crypto.randomUUID();sessionStorage.setItem("gentwelve_campaign_visitor",visitor)}void fetch("/api/campaign-events",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,visitor,event,productCode}),keepalive:true}).catch(()=>{})}catch{}}
function click(c:CampaignRecord){try{localStorage.setItem("gentwelve_campaign_attribution",JSON.stringify({id:c.id,at:Date.now()}))}catch{}track(c.id,"click")}
function Creative({campaign:c,kind,onDismiss}:{campaign:CampaignRecord;kind:string;onDismiss?:()=>void}){
 const ref=useRef<HTMLElement>(null);
 useEffect(()=>{const node=ref.current;if(!node)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){track(c.id,"impression");observer.disconnect()}},{threshold:.5});observer.observe(node);return()=>observer.disconnect()},[c.id]);
 return <section className={`campaign-creative campaign-${kind}`} ref={ref}>{c.data.desktopImage&&kind!=="announcement"&&<picture>{c.data.mobileImage&&<source media="(max-width:650px)" srcSet={c.data.mobileImage}/>}<img src={c.data.desktopImage} alt="" loading={kind==="popup"?"eager":"lazy"}/></picture>}<div className="campaign-copy"><h2 id={kind==="popup"?"campaign-popup-heading":undefined}>{c.data.headline}</h2>{c.data.text&&<p>{c.data.text}</p>}<a href={c.data.ctaDestination} onClick={()=>click(c)}>{c.data.ctaLabel} <span aria-hidden="true">↗</span></a>{onDismiss&&<button type="button" className="campaign-later" onClick={onDismiss}>Maybe later</button>}</div></section>
}
export default function CampaignSlots({page,category="",product=""}:{page:"home"|"browse"|"product";category?:string;product?:string}){
 const[items,setItems]=useState<CampaignRecord[]>([]),[popup,setPopup]=useState<CampaignRecord|null>(null);const dialog=useRef<HTMLDialogElement>(null),shown=useRef(new Set<string>());
 useEffect(()=>{let alive=true;const controller=new AbortController();async function load(){try{const r=await fetch(`/api/campaigns?${new URLSearchParams({page,category,product})}`,{signal:controller.signal});const d=await r.json();if(alive)setItems(d.items||[])}catch{}}void load();const timer=setInterval(()=>{if(document.visibilityState==="visible")void load()},60000);return()=>{alive=false;controller.abort();clearInterval(timer)}},[page,category,product]);
 useEffect(()=>{if(!product)return;try{const c=JSON.parse(localStorage.getItem("gentwelve_campaign_attribution")||"null");if(c&&Date.now()-c.at<30*86400000)track(c.id,"product_view",product)}catch{}},[product]);
 useEffect(()=>{const timer=setTimeout(()=>{if(popup){if(!items.some(c=>c.id===popup.id)){dialog.current?.close();setPopup(null)}return}
 if(shown.current.size)return;
 const eligible=items.find(c=>{if(!c.data.types.includes("popup")||shown.current.has(c.id))return false;try{return popupEligible(c.data,{sessionSeen:sessionStorage.getItem(`gt_campaign_${c.id}`)==="seen",lastSeen:Number(localStorage.getItem(`gt_campaign_${c.id}`)||0)})}catch{return false}});
 if(eligible){shown.current.add(eligible.id);try{sessionStorage.setItem(`gt_campaign_${eligible.id}`,"seen");localStorage.setItem(`gt_campaign_${eligible.id}`,String(Date.now()))}catch{}setPopup(eligible)}},1200);return()=>clearTimeout(timer)},[items,popup]);
 useEffect(()=>{if(popup&&!dialog.current?.open)dialog.current?.showModal()},[popup]);
 function dismiss(){if(popup)track(popup.id,"dismiss");dialog.current?.close();setPopup(null)}
 const announcement=items.find(c=>c.data.types.includes("announcement")),hero=page!=="product"?items.find(c=>c.data.types.includes("hero")):null,promotion=page==="product"?items.find(c=>c.data.types.includes("product")):null;
 return <>{announcement&&<Creative campaign={announcement} kind="announcement"/>}{hero&&<Creative campaign={hero} kind="hero"/>}{promotion&&<Creative campaign={promotion} kind="product"/>}{popup&&<dialog ref={dialog} className="campaign-dialog" aria-labelledby="campaign-popup-heading" onCancel={e=>{e.preventDefault();dismiss()}} onClick={e=>{if(e.target===dialog.current)dismiss()}}><button type="button" className="campaign-close" aria-label="Close promotion" onClick={dismiss}>×</button><Creative campaign={popup} kind="popup" onDismiss={dismiss}/></dialog>}</>
}
