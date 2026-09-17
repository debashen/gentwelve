"use client";

import { useEffect,useState } from "react";
import { ArrowLeft,Eye,LoaderCircle,MessageCircle,Search,Users } from "lucide-react";

type Summary={visitors:number;productViews:number;enquiries:number;searches:number;conversion:number};
type Daily={date:string;views:number;enquiries:number};
type Product={code:string;name:string;image:string|null;views:number;enquiries:number};
type Ranked={term?:string;name?:string;count:number};
type Payload={days:number;summary:Summary;daily:Daily[];topProducts:Product[];searches:Ranked[];filters:Ranked[];error?:string};

export default function AnalyticsDashboard(){
 const[days,setDays]=useState(30),[data,setData]=useState<Payload|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{const controller=new AbortController();fetch(`/api/admin/analytics?days=${days}`,{cache:"no-store",signal:controller.signal}).then(async response=>{const payload=await response.json() as Payload;if(!response.ok)throw new Error(payload.error||"Could not load enquiry activity.");setData(payload)}).catch(reason=>{if(!(reason instanceof DOMException&&reason.name==="AbortError"))setError(reason instanceof Error?reason.message:"Could not load enquiry activity.")}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[days]);
 const maxDaily=Math.max(1,...(data?.daily||[]).map(item=>Number(item.views)+Number(item.enquiries)));
 return <section className="analytics-shell">
  <header className="analytics-header"><div><a href="/admin/catalogue"><ArrowLeft/> Catalogue control</a><span>SALES SIGNALS</span><h1>What customers want.</h1><p>Anonymous product interest and WhatsApp enquiry activity from the discovery site.</p></div><div className="range-tabs">{[7,30,90].map(value=><button className={days===value?"active":""} onClick={()=>{setLoading(true);setError("");setDays(value)}} key={value}>{value} days</button>)}</div></header>
  {error&&<div className="review-error">{error}</div>}
  {loading&&!data?<div className="review-loading"><LoaderCircle className="spin"/>Loading activity…</div>:data&&<>
   <div className="metric-grid"><article><Users/><small>Anonymous visitors</small><strong>{data.summary.visitors.toLocaleString()}</strong></article><article><Eye/><small>Product opens</small><strong>{data.summary.productViews.toLocaleString()}</strong></article><article className="primary"><MessageCircle/><small>WhatsApp enquiries</small><strong>{data.summary.enquiries.toLocaleString()}</strong></article><article><Search/><small>Searches</small><strong>{data.summary.searches.toLocaleString()}</strong></article><article><span className="percent">%</span><small>Enquiry rate</small><strong>{data.summary.conversion}%</strong></article></div>
   <section className="activity-panel"><div className="panel-heading"><div><span>01</span><h2>Interest over time</h2></div><p>Product opens <i/> WhatsApp enquiries <i/></p></div>{data.daily.length?<div className="activity-chart">{data.daily.map(item=><div className="activity-day" key={item.date}><div className="bars"><span style={{height:`${Math.max(4,(Number(item.views)/maxDaily)*100)}%`}} title={`${item.views} product opens`}/><b style={{height:`${Math.max(item.enquiries?4:0,(Number(item.enquiries)/maxDaily)*100)}%`}} title={`${item.enquiries} enquiries`}/></div><small>{new Date(`${item.date}T12:00:00`).toLocaleDateString("en-ZA",{day:"numeric",month:"short"})}</small></div>)}</div>:<div className="analytics-empty">Activity will appear as customers browse the catalogue.</div>}</section>
   <div className="analytics-columns"><section className="ranking-panel"><div className="panel-heading"><div><span>02</span><h2>Products creating interest</h2></div></div>{data.topProducts.length?<ol>{data.topProducts.map((product,index)=><li key={product.code}><span className="rank">{String(index+1).padStart(2,"0")}</span>{product.image?<img src={product.image} alt=""/>:<div className="rank-image"/>}<div><strong>{product.name}</strong><small>{product.code}</small></div><p><b>{Number(product.enquiries)}</b> enquiries<br/><span>{Number(product.views)} opens</span></p></li>)}</ol>:<div className="analytics-empty">No product activity yet.</div>}</section><aside className="signal-stack"><section><div className="panel-heading"><div><span>03</span><h2>Popular searches</h2></div></div>{data.searches.length?<ol>{data.searches.map(item=><li key={item.term}><span>{item.term}</span><b>{Number(item.count)}</b></li>)}</ol>:<p className="analytics-empty">No searches yet.</p>}</section><section><div className="panel-heading"><div><span>04</span><h2>Used filters</h2></div></div>{data.filters.length?<ol>{data.filters.map(item=><li key={item.name}><span>{item.name}</span><b>{Number(item.count)}</b></li>)}</ol>:<p className="analytics-empty">No filter activity yet.</p>}</section></aside></div>
  </>}
 </section>;
}
