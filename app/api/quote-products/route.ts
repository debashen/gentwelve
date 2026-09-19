import {NextResponse} from "next/server";
import {getProductPageData} from "@/lib/catalogue-product";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const codes=[...new Set((new URL(request.url).searchParams.get("codes")||"").split(",").filter(Boolean))];
 if(!codes.length||codes.length>30||codes.some(c=>c.length>200))return NextResponse.json({error:"Choose up to 30 products."},{status:400});
 try{const products=await Promise.all(codes.map(async code=>{const d=await getProductPageData(code);return d?{product:d.product,variants:d.variants}:null}));return NextResponse.json({products:products.filter(Boolean)},{headers:{"Cache-Control":"private, max-age=30"}})}catch{return NextResponse.json({error:"Product details are temporarily unavailable."},{status:503})}
}
