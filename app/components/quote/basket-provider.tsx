"use client";
import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import {BASKET_KEY,parseBasket,type BasketItem} from "@/lib/quote-basket";
const Context=createContext<{items:BasketItem[];ready:boolean;add:(item:Omit<BasketItem,"id">)=>void;update:(id:string,item:Partial<BasketItem>)=>void;remove:(id:string)=>void;clear:()=>void;storageError:string}|null>(null);
export function BasketProvider({children}:{children:ReactNode}){
 const[items,setItems]=useState<BasketItem[]>([]),[ready,setReady]=useState(false),[storageError,setStorageError]=useState("");
 useEffect(()=>{const timer=setTimeout(()=>{try{setItems(parseBasket(localStorage.getItem(BASKET_KEY)))}catch{setStorageError("Browser storage is unavailable. Keep this tab open until you submit your quote.")}setReady(true)},0);const sync=(e:StorageEvent)=>{if(e.key===BASKET_KEY)setItems(parseBasket(e.newValue))};window.addEventListener("storage",sync);return()=>{clearTimeout(timer);window.removeEventListener("storage",sync)}},[]);
 useEffect(()=>{if(!ready)return;try{localStorage.setItem(BASKET_KEY,JSON.stringify(items))}catch{/* The in-memory basket remains usable. */}},[items,ready]);
 return <Context.Provider value={{items,ready,storageError,add:item=>setItems(rows=>{if(rows.length>=30)throw new Error("Your quote can contain up to 30 items.");return [...rows,{...item,id:crypto.randomUUID()}]}),update:(id,item)=>setItems(rows=>rows.map(r=>r.id===id?{...r,...item,id}:r)),remove:id=>setItems(rows=>rows.filter(r=>r.id!==id)),clear:()=>setItems([])}}>{children}</Context.Provider>
}
export function useBasket(){const context=useContext(Context);if(!context)throw new Error("Quote basket unavailable");return context}
export function BasketLink(){const{items}=useBasket();return <a href="/quote" className="basket-link" aria-label={`Quote basket, ${items.length} products`}>Quote basket <span>{items.length}</span></a>}
