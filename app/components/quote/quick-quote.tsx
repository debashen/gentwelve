"use client";
import {useEffect,useState} from "react";
import type {ProductPageProduct,ProductPageVariant} from "@/lib/catalogue-product";
import AddProduct from "./add-product";
export default function QuickQuote({code}:{code:string}){
 const[data,setData]=useState<{product:ProductPageProduct;variants:ProductPageVariant[]}|null>(null),[error,setError]=useState("");
 useEffect(()=>{const controller=new AbortController();fetch(`/api/quote-products?codes=${encodeURIComponent(code)}`,{signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok||!d.products?.[0])throw new Error("Product options are unavailable. Please try again.");setData(d.products[0])}).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>controller.abort()},[code]);
 return error?<p role="alert">{error}</p>:data?<AddProduct key={code} {...data}/>:<p>Loading product options…</p>
}
