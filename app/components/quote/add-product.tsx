"use client";
import {useState} from "react";
import type {ProductPageProduct,ProductPageVariant} from "@/lib/catalogue-product";
import type {QuoteSelection} from "@/lib/quote-request-schema";
import {useBasket} from "./basket-provider";
import ProductOptions from "./product-options";
export default function AddProduct({product,variants}:{product:ProductPageProduct;variants:ProductPageVariant[]}){
 const basket=useBasket(),[selection,setSelection]=useState<QuoteSelection>({code:product.code,variantCode:"",quantity:null,branded:false,method:"",position:"",notes:""}),[notice,setNotice]=useState("");
 const validQuantity=selection.quantity===null||(Number.isInteger(selection.quantity)&&selection.quantity>=1&&selection.quantity<=1000000);
 const selected=variants.find(v=>v.code===selection.variantCode);
 return <><ProductOptions product={product} variants={variants} value={selection} onChange={setSelection}/><button className="quote-primary" disabled={!basket.ready||basket.items.length>=30||!validQuantity} onClick={()=>{basket.add({...selection,productId:product.id,name:product.name,image:product.image,colour:selected?.colour||"",size:selected?.size||"",priceCents:selected?.priceCents??product.priceCents});setNotice("Added to your quote basket.")}}>Add to quote</button>{!validQuantity&&<p role="alert">Enter a whole quantity between 1 and 1,000,000, or choose Not sure yet.</p>}{notice&&<p role="status">{notice} <a href="/quote">Review quote →</a></p>}{basket.items.length>=30&&<p>Your basket has reached 30 items. Submit it before adding more.</p>}</>
}
