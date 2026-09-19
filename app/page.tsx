"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Mail, Menu, MessageCircle, Phone, Search, X } from "lucide-react";

import CampaignSlots from "./components/campaigns/campaign-slots";
import QuickQuote from "./components/quote/quick-quote";
import {BasketLink} from "./components/quote/basket-provider";
import { enquiryPath } from "@/lib/whatsapp";

type Product={id:number|string;name:string;code:string;category:string;brand?:string;price:number;image:string;tall?:boolean;tag?:string;methods:string[];minimumQuantity?:number;stockQuantity?:number;colours?:string[];sizes?:string[]};
type VariantStock={code:string;colour:string;size:string;stock:number};
const filters=["Discover","Trending","New","Under R100","Under R250","Clothing","Drinkware","Bags","Tech","Events"];
type ProductPayload={products?:Array<Record<string,unknown>>;total?:number;page?:number;hasMore?:boolean;unavailable?:boolean};
const mapProduct=(p:Record<string,unknown>):Product=>({id:String(p.code),name:String(p.name),code:String(p.code),category:String(p.category||p.brand||"Products"),brand:String(p.brand||""),price:Math.ceil(Number(p.priceCents||0)/100),image:String(p.image),methods:Array.isArray(p.methods)?p.methods.map(String):[],minimumQuantity:Number(p.minimumQuantity||0),stockQuantity:Number(p.stockQuantity||0),colours:Array.isArray(p.colours)?p.colours.map(String):[],sizes:Array.isArray(p.sizes)?p.sizes.map(String):[]});
const stockLabel=(stock=0)=>stock>0?`${Math.floor(stock).toLocaleString()} units available`:"Out of stock";
const stockClass=(stock=0)=>stock>0?"available":"out-of-stock";


export default function Home(){
 const[products,setProducts]=useState<Product[]>([]),[filter,setFilter]=useState("Discover"),[query,setQuery]=useState(""),[debouncedQuery,setDebouncedQuery]=useState(""),[selected,setSelected]=useState<Product|null>(null),[menuOpen,setMenuOpen]=useState(false),[contactCompact,setContactCompact]=useState(false),[contactForcedOpen,setContactForcedOpen]=useState(false),[page,setPage]=useState(0),[total,setTotal]=useState(0),[catalogueTotal,setCatalogueTotal]=useState(0),[hasMore,setHasMore]=useState(true),[loading,setLoading]=useState(true);
 const[variantStock,setVariantStock]=useState<VariantStock[]>([]),[variantLoading,setVariantLoading]=useState(false);
 const [catalogueError,setCatalogueError]=useState(false);
 const latestRequest=useRef(0);
 const loader=useRef<HTMLDivElement|null>(null);
 const analyticsSession=useRef("");
 const track=useCallback((eventType:string,details:Record<string,string>={})=>{try{if(!analyticsSession.current){analyticsSession.current=sessionStorage.getItem("gentwelve_session")||crypto.randomUUID();sessionStorage.setItem("gentwelve_session",analyticsSession.current)}void fetch("/api/events",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({eventType,sessionId:analyticsSession.current,...details}),keepalive:true}).catch(()=>{})}catch{}},[]);
 useEffect(()=>{const timer=window.setTimeout(()=>setDebouncedQuery(query.trim()),350);return()=>window.clearTimeout(timer)},[query]);
 useEffect(()=>{if(debouncedQuery.length>=2)track("search",{searchQuery:debouncedQuery})},[debouncedQuery,track]);
 const requestPage=useCallback(async(pageNumber:number,replace=false,signal?:AbortSignal)=>{
  const requestId=++latestRequest.current;
  setLoading(true);setCatalogueError(false);
  if(replace){setProducts([]);setPage(0);setHasMore(true)}
  try{
   const params=new URLSearchParams({page:String(pageNumber),filter});if(debouncedQuery)params.set("q",debouncedQuery);
   const response=await fetch(`/api/products?${params}`,{signal,cache:"no-store"});
   const payload=await response.json() as ProductPayload;
   if(!response.ok||payload.unavailable)throw new Error("Catalogue unavailable");
   if(signal?.aborted||requestId!==latestRequest.current)return;
   const next=(payload.products||[]).map(mapProduct),nextTotal=Number(payload.total||0);
   setProducts(current=>replace?next:[...current,...next]);setPage(pageNumber);setTotal(nextTotal);
   if(filter==="Discover"&&!debouncedQuery)setCatalogueTotal(nextTotal);
   setHasMore(Boolean(payload.hasMore));
  }catch{
   if(signal?.aborted||requestId!==latestRequest.current)return;
   if(replace){setProducts([]);setTotal(0)}setCatalogueError(true);setHasMore(false);
  }finally{if(!signal?.aborted&&requestId===latestRequest.current)setLoading(false)}
 },[filter,debouncedQuery]);
 useEffect(()=>{
  const controller=new AbortController();
  const timer=window.setTimeout(()=>void requestPage(0,true,controller.signal),0);
  return()=>{window.clearTimeout(timer);controller.abort()};
 },[requestPage]);
 useEffect(()=>{const node=loader.current;if(!node||!hasMore||loading)return;const observer=new IntersectionObserver(entries=>{if(entries[0]?.isIntersecting)void requestPage(page+1)},{rootMargin:"500px"});observer.observe(node);return()=>observer.disconnect()},[hasMore,loading,page,requestPage]);
 useEffect(()=>{const handle=()=>{if(window.scrollY<160){setContactCompact(false);setContactForcedOpen(false)}else if(window.scrollY>420&&!contactForcedOpen)setContactCompact(true)};handle();window.addEventListener("scroll",handle,{passive:true});return()=>window.removeEventListener("scroll",handle)},[contactForcedOpen]);
 useEffect(()=>{document.body.style.overflow=selected?"hidden":"";return()=>{document.body.style.overflow=""}},[selected]);
 const openProduct=useCallback((product:Product)=>{setSelected(product);setVariantStock([]);setVariantLoading(true);track("product_view",{productCode:product.code});void fetch(`/api/product-variants?code=${encodeURIComponent(product.code)}`).then(response=>response.json()).then((payload:{variants?:VariantStock[]})=>setVariantStock(Array.isArray(payload.variants)?payload.variants:[])).catch(()=>setVariantStock([])).finally(()=>setVariantLoading(false))},[track]);
 const selectedStock=variantStock.length?variantStock.reduce((sum,v)=>sum+v.stock,0):Number(selected?.stockQuantity||0);
 const whats=selected?enquiryPath(selected.code,"Not sure","Not sure"):"#";
 return <main>
  <header className="site-header"><a className="brand" href="#top" aria-label="Gentwelve home"><img className="header-logo" src="/gentwelve-web-logo-w.svg" alt="Gentwelve Printing Co"/></a><nav className={menuOpen?"nav open":"nav"} aria-label="Primary navigation"><a href="#discover" onClick={()=>setMenuOpen(false)}>Discover</a><a href="#how" onClick={()=>setMenuOpen(false)}>How it works</a><a href="#about" onClick={()=>setMenuOpen(false)}>About us</a></nav><BasketLink/><a className="header-cta" href="/api/whatsapp"><MessageCircle size={17}/> Start an enquiry</a><button className="menu-button" onClick={()=>setMenuOpen(!menuOpen)} aria-label="Toggle menu"><Menu/></button></header>
  <CampaignSlots page={debouncedQuery||filter!=="Discover"?"browse":"home"} category={filter==="Discover"?"":filter}/>
  <section className="intro" id="top"><div className="eyebrow"><span/> BRANDED PRODUCT DISCOVERY</div><h1>Find something worth<br/>putting your brand on.</h1><p>Browse curated product ideas, see indicative pricing, then build your quote with the products you love.</p><label className="search-box"><Search size={20}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search bottles, golf shirts, bags..."/><kbd>⌘ K</kbd></label><div className="trust-row"><span>{catalogueTotal?`${catalogueTotal.toLocaleString()} products live`:"Thousands of products available"}</span><span>Nationwide delivery</span><span>Design support included</span></div></section>
  <section className="catalogue" id="discover"><div className="filter-bar">{filters.map(x=><button key={x} className={filter===x?"active":""} onClick={()=>{if(x!==filter)track("filter",{filterName:x});setFilter(x)}}>{x}</button>)}</div><div className="section-heading"><div><span className="index">01</span><h2>{filter==="Discover"?"Ideas worth exploring":filter}</h2></div><p>{total.toLocaleString()} products</p></div>{products.length?<><div className="product-grid">{products.map(p=><article className="product-card" key={p.id} onClick={()=>openProduct(p)}><div className="image-wrap"><img src={p.image} alt={p.name} loading="lazy"/><span className="tag">{p.category}</span></div><div className="card-copy"><div className="product-details"><p>{p.brand||"Gentwelve selection"} · {p.code}</p><h3>{p.name}</h3></div><div className="card-bottom"><div className="price"><small>FROM</small>R{p.price}<span>ea*</span></div><button aria-label={`View ${p.name}`}>View <ArrowUpRight/></button></div></div></article>)}</div><div className="catalogue-loader" ref={loader}>{loading?"Loading more products…":hasMore?"Scroll to see more":"You have reached the end"}</div></>:loading?<div className="catalogue-loader">Loading products…</div>:<div className="empty"><h3>{catalogueError?"Catalogue temporarily unavailable.":"No close matches."}</h3><p>{catalogueError?"Please try again shortly or contact us for product advice.":"Try a broader search or another category."}</p></div>}</section>
  <section className="process" id="how"><span className="index">02</span><div><h2>See it. Brand it.<br/>Make it yours.</h2><p>You bring the logo. We help choose the product, branding method and quantity that makes commercial sense.</p></div><ol><li><b>01</b><span><strong>Explore ideas</strong>Browse by use, category or budget.</span></li><li><b>02</b><span><strong>Send an enquiry</strong>Build a basket and request your quotation.</span></li><li><b>03</b><span><strong>Approve and produce</strong>We confirm pricing, artwork and delivery.</span></li></ol></section>
  <footer id="about"><div className="brand footer-brand"><img src="/gentwelve-web-logo-w.svg" alt="Gentwelve Printing Co"/></div><p>More than ink on paper. Strategic branding, promotional products and print delivered across South Africa.</p><div><a href="tel:+27100130297">010 013 0297</a><a href="/api/whatsapp">WhatsApp sales</a></div><small>Indicative product-only prices shown. Branding, setup and delivery quoted separately.</small></footer>
  {!selected&&(contactCompact?<button className="mobile-contact-toggle" onClick={()=>{setContactCompact(false);setContactForcedOpen(true)}} aria-label="Open contact options"><MessageCircle/></button>:<nav className="mobile-contact-bar" aria-label="Contact Gentwelve"><a href="tel:+27100130297"><Phone/><span>Call</span></a><a className="whatsapp" href="/api/whatsapp"><MessageCircle/><span>WhatsApp</span></a><a href="mailto:debashen@gentwelve.com"><Mail/><span>Email</span></a><button onClick={()=>{setContactCompact(true);setContactForcedOpen(false)}} aria-label="Minimise contact options"><ChevronDown/></button></nav>)}
  {selected&&<div className="drawer-backdrop" onMouseDown={()=>setSelected(null)}><aside className="product-drawer" onMouseDown={e=>e.stopPropagation()} role="dialog" aria-modal="true"><button className="close" onClick={()=>setSelected(null)} aria-label="Close"><X/></button><img src={selected.image} alt={selected.name}/><div className="drawer-copy"><span className="drawer-code">{selected.code} · {selected.category}</span><h2>{selected.name}</h2><div className="drawer-price">From R{selected.price} each* <small>Product only</small></div><div className="product-facts"><span><small>Minimum order</small>{selected.minimumQuantity||"Ask us"}</span><span className={`stock ${stockClass(selectedStock)}`}><small>Stock across variants</small>{variantLoading?"Checking stock…":stockLabel(selectedStock)}</span></div><QuickQuote key={selected.code} code={selected.code}/><a className="full-product-link" href={`/product/${encodeURIComponent(selected.code)}`}>View full product page <ArrowUpRight/></a><a className="product-detail-secondary" href={whats} target="_blank" rel="noreferrer">Ask us on WhatsApp</a><small className="fine-print">Stock is based on the latest supplier update and is confirmed when we quote. Final pricing depends on quantity, branding method and artwork.</small></div></aside></div>}
 </main>
}
