"use client";

import Link from "next/link";
import { useEffect,useState } from "react";
import { CheckCircle2,Database,LoaderCircle,PackageCheck,RefreshCw,WalletCards,XCircle } from "lucide-react";

type Dataset="products"|"variants"|"prices"|"stock"|"enrichment";
type Busy=Dataset|"all";
type Result={mode?:string;diagnostics?:{supplierRecords:number;uniqueCodes:number;variants:number;skipped:number;missingCode:number;missingName:number;duplicates:number;inactive:number};ok?:boolean;id?:number;runId?:number;dataset?:Dataset;received?:number;stored?:number;error?:string;status?:string};
type Overview={runs:Partial<Record<Dataset,Result|null>>;metrics:{products:number;variants:number;prices:number;stock:number;ready:number}};

const empty:Overview={runs:{},metrics:{products:0,variants:0,prices:0,stock:0,ready:0}};

export default function ImportPanel(){
 const[overview,setOverview]=useState<Overview>(empty),[busy,setBusy]=useState<Busy|null>(null),[activeDataset,setActiveDataset]=useState<Dataset|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");

 async function request(url:string,options?:RequestInit){
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),290000);
  try{return await fetch(url,{...options,signal:controller.signal})}
  catch(reason){
   if(reason instanceof DOMException&&reason.name==="AbortError")throw new Error("The connection paused. Your progress is saved — use Resume to continue.");
   throw reason;
  }finally{window.clearTimeout(timeout)}
 }

 async function requestWithRetry(url:string,options?:RequestInit){
  let lastError:unknown;
  for(let attempt=0;attempt<4;attempt++){
   try{return await request(url,options)}catch(reason){
    lastError=reason;
    if(attempt<3)await new Promise(resolve=>window.setTimeout(resolve,1000*(2**attempt)));
   }
  }
  throw new Error(lastError instanceof Error&&lastError.message.includes("paused")?lastError.message:"The connection dropped after several retries. Your progress is saved. Use Resume to continue.");
 }

 async function refresh(){const response=await request("/api/admin/sync",{cache:"no-store"});if(response.ok)setOverview(await response.json() as Overview)}
 useEffect(()=>{const controller=new AbortController();fetch("/api/admin/sync",{cache:"no-store",signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error("Import status unavailable. Check the database setup.");setOverview(await response.json() as Overview)}).catch(()=>{if(!controller.signal.aborted)setError("Import status unavailable. Check the database setup.")});return()=>controller.abort()},[]);

 async function execute(dataset:Dataset,strategy?:"changes"){
 let current=overview.runs[dataset];
  let runId=current?.status==="running"&&(dataset!=="products"||current.mode===(strategy==="changes"?"changes":"full"))?current.id:undefined;
  setActiveDataset(dataset);
  if(!runId){const params=new URLSearchParams({type:dataset});if(strategy)params.set("strategy",strategy);const start=await request(`/api/admin/sync?${params}`,{method:"POST"});const payload=await start.json() as Result;if(!start.ok||!payload.runId)throw new Error(payload.error||`Could not start ${dataset} import.`);runId=payload.runId;current=payload;setOverview(previous=>({...previous,runs:{...previous.runs,[dataset]:payload}}))}
  for(let step=0;step<500;step++){
   const response=await requestWithRetry(`/api/admin/sync?runId=${runId}`,{method:"POST"});
   const payload=await response.json() as Result;
   setOverview(previous=>({...previous,runs:{...previous.runs,[dataset]:payload}}));
   if(!response.ok||payload.status==="failed")throw new Error(payload.error||`${dataset} import stopped.`);
   if(payload.status==="complete")return;
   await new Promise(resolve=>setTimeout(resolve,250));
  }
 throw new Error(`${dataset} import paused. Progress was saved.`);
 }

 async function importPrices(){setBusy("prices");setError("");try{if(overview.runs.variants?.status!=="complete")await execute("variants");await execute("prices");await refresh()}catch(reason){await refresh().catch(()=>{});setError(reason instanceof Error?reason.message:"Pricing import stopped.")}finally{setBusy(null);setActiveDataset(null)}}
 async function importStock(){setBusy("stock");setError("");try{if(overview.runs.variants?.status!=="complete")await execute("variants");await execute("stock");await refresh()}catch(reason){await refresh().catch(()=>{});setError(reason instanceof Error?reason.message:"Stock import stopped.")}finally{setBusy(null);setActiveDataset(null)}}
 async function prepareCatalogue(){setBusy("enrichment");setError("");try{await execute("enrichment");await refresh()}catch(reason){await refresh().catch(()=>{});setError(reason instanceof Error?reason.message:"Catalogue preparation stopped.")}finally{setBusy(null);setActiveDataset(null)}}
 async function importProducts(){setBusy("products");setError("");setNotice("");try{await execute("products");await execute("variants");await execute("enrichment");await execute("prices");await execute("stock");await refresh();setNotice("Full catalogue, variants, prices and stock reconciliation complete.")}catch(reason){await refresh().catch(()=>{});setError(reason instanceof Error?reason.message:"Product reconciliation paused.")}finally{setBusy(null);setActiveDataset(null)}}
 async function updateEverything(){setBusy("all");setError("");setNotice("");try{await execute("products");await execute("variants");await execute("enrichment");await execute("prices");await execute("stock");await refresh();setNotice("Full supplier catalogue, prices and stock are current.")}catch(reason){await refresh().catch(()=>{});setError(reason instanceof Error?reason.message:"Catalogue update paused.")}finally{setBusy(null);setActiveDataset(null)}}

 const productComplete=overview.runs.products?.status==="complete";
 const priceComplete=overview.runs.prices?.status==="complete";
 const stockComplete=overview.runs.stock?.status==="complete";
 const enrichmentComplete=overview.runs.enrichment?.status==="complete";
 const priceRunning=overview.runs.prices?.status==="running";
 const stockRunning=overview.runs.stock?.status==="running";
 const activeRun=activeDataset?overview.runs[activeDataset]:null;
 const preparing=activeDataset==="variants";
 const progressLabel=preparing?"Preparing product variants":activeDataset==="products"?"Updating products":activeDataset==="stock"?"Importing stock":activeDataset==="enrichment"?"Preparing catalogue":"Importing pricing";
 const progressUnit=preparing||activeDataset==="enrichment"?`${activeRun?.received?.toLocaleString()||0} of ${overview.metrics.products.toLocaleString()} products prepared`:`${activeRun?.received?.toLocaleString()||0} records processed`;

 return <div className="admin-card admin-dashboard">
  <div className="admin-status"><span className={`status-dot ${priceComplete&&stockComplete?"done":"running"}`}/>{priceComplete&&stockComplete?"DATA FOUNDATION COMPLETE":"NEXT PHASE"}</div>
  <h1>Catalogue data control</h1>
  <p>Supplier costs remain private. Public selling prices use the configured Gentwelve pricing rule and will stay hidden until products are curated.</p>
  {productComplete&&<section className="daily-update"><div><span>DAILY MAINTENANCE</span><h2>Update everything in one go</h2><p>Reconcile the complete Amrod catalogue, refresh selling prices and replace current stock figures.</p></div><button onClick={updateEverything} disabled={Boolean(busy)}>{busy==="all"?<LoaderCircle className="spin"/>:<RefreshCw/>}{busy==="all"?"Updating…":"Update catalogue now"}</button></section>}
  <div className="sync-grid">
   <section className={`sync-step ${productComplete?"complete":""}`}><div className="sync-icon"><Database/></div><span className="sync-number">01</span><h2>Products</h2><p>Core product data, images, categories and brands. Run a full reconciliation weekly.</p><strong>{overview.metrics.products.toLocaleString()} products</strong><button onClick={importProducts} disabled={Boolean(busy)}>{busy==="products"?<LoaderCircle className="spin"/>:<RefreshCw/>}{busy==="products"?"Reconciling…":productComplete?"Full weekly refresh":"Import products"}</button></section>
   <section className={`sync-step ${priceComplete?"complete":""}`}><div className="sync-icon"><WalletCards/></div><span className="sync-number">02</span><h2>Pricing</h2><p>Variant costs plus Gentwelve selling-price calculations.</p><strong>{overview.metrics.prices.toLocaleString()} prices</strong><button onClick={importPrices} disabled={Boolean(busy)||!productComplete}>{busy==="prices"?<LoaderCircle className="spin"/>:<RefreshCw/>}{busy==="prices"?(preparing?"Preparing…":"Importing…"):priceComplete?"Refresh prices":priceRunning?"Resume prices":"Import prices"}</button></section>
   <section className={`sync-step ${stockComplete?"complete":""}`}><div className="sync-icon"><PackageCheck/></div><span className="sync-number">03</span><h2>Stock</h2><p>Current sellable variant availability using Amrod stock type 2.</p><strong>{overview.metrics.stock.toLocaleString()} stock records</strong><button onClick={importStock} disabled={Boolean(busy)||!productComplete}>{busy==="stock"?<LoaderCircle className="spin"/>:<RefreshCw/>}{busy==="stock"?(preparing?"Preparing…":"Importing…"):stockComplete?"Refresh stock":stockRunning?"Resume stock":"Import stock"}</button></section>
  </div>
  {busy&&activeDataset&&<div className="admin-result progress"><LoaderCircle className="spin"/><span><strong>{progressLabel}</strong>{progressUnit}. Keep this page open; this stage can take several minutes.</span></div>}
  {notice&&<div className="admin-result success"><CheckCircle2/><span><strong>Everything is current</strong>{notice}</span></div>}
  {error&&<div className="admin-result failure"><XCircle/><span><strong>Import paused</strong>{error} Progress is saved, so the same button can resume it.</span></div>}
  {priceComplete&&stockComplete&&!enrichmentComplete&&<section className="admin-next"><div><span>04</span><h2>Prepare the catalogue</h2><p>Map Amrod’s nested product images, categories, brands and minimum quantities into the Gentwelve catalogue.</p></div><button onClick={prepareCatalogue} disabled={Boolean(busy)}>{busy==="enrichment"?<LoaderCircle className="spin"/>:<RefreshCw/>}{busy==="enrichment"?"Preparing…":overview.runs.enrichment?.status==="running"?"Resume preparation":"Prepare catalogue"}</button></section>}
  {enrichmentComplete&&<div className="admin-result success"><CheckCircle2/><span><strong>{overview.metrics.ready.toLocaleString()} products ready for review</strong>Manage the discovery feed or see what customers are engaging with. <a href="/admin/catalogue">Open catalogue review →</a> <a href="/admin/analytics">View enquiry intelligence →</a></span></div>}
  <section className="sales-panel"><h2>Supplier sync diagnostics</h2><p>{overview.metrics.products.toLocaleString()} parent products · {overview.metrics.variants.toLocaleString()} variant SKUs. Prices and stock are variant records, not additional parent products.</p>{(["products","prices","stock"] as const).map(dataset=>{const run=overview.runs[dataset],d=run?.diagnostics;return <details key={dataset}><summary>{dataset}: {run?.status||"Not run"} · {run?.received||0} processed / {run?.stored||0} stored</summary>{d?<p>Supplier records: {d.supplierRecords} · Unique codes: {d.uniqueCodes} · Embedded variants: {d.variants} · Skipped: {d.skipped} · Missing code: {d.missingCode} · Missing name: {d.missingName} · Duplicate codes: {d.duplicates} · Inactive/discontinued: {d.inactive}</p>:<p>Run a full refresh to capture supplier diagnostics.</p>}{run?.error&&<p role="alert">{run.error}</p>}</details>})}</section>
  <Link className="admin-back" href="/">← Back to product discovery</Link>
 </div>
}
