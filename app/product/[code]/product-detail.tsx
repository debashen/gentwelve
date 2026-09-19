"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, Copy, MessageCircle } from "lucide-react";
import type { ProductPageProduct, ProductPageVariant, RelatedProduct } from "@/lib/catalogue-product";

import CampaignSlots from "@/app/components/campaigns/campaign-slots";
import AddProduct from "@/app/components/quote/add-product";
import {BasketLink} from "@/app/components/quote/basket-provider";
import { enquiryPath } from "@/lib/whatsapp";

const formatPrice = (cents: number) => Math.ceil(cents / 100).toLocaleString("en-ZA");

export default function ProductDetail({ product, variants, related }: { product: ProductPageProduct; variants: ProductPageVariant[]; related: RelatedProduct[] }) {
  const [gallery,setGallery]=useState(product.image);

  const [copied, setCopied] = useState(false);
  const [pageUrl, setPageUrl] = useState("");
  const session = useRef("");

  const stock=product.stock,priceCents=product.priceCents;

  useEffect(() => {
    const timer=window.setTimeout(()=>setPageUrl(window.location.href),0);
    try {
      session.current = sessionStorage.getItem("gentwelve_session") || crypto.randomUUID();
      sessionStorage.setItem("gentwelve_session", session.current);
      void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventType: "product_view", productCode: product.code, sessionId: session.current }), keepalive: true }).catch(()=>{});
    } catch { /* analytics must never block the page */ }
    return()=>window.clearTimeout(timer);
  }, [product.code]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard permission can be denied */ }
  };

  const shareMessage = `Take a look at ${product.name} from Gentwelve Printing Co: `;
  const quoteUrl = enquiryPath(product.code, "Not sure", "Not sure");

  return <main className="product-page">
    <header className="product-page-header">
      <Link href="/" aria-label="Gentwelve catalogue"><img src="/gentwelve-web-logo-w.svg" alt="Gentwelve Printing Co" /></Link>
      <BasketLink/><Link className="back-to-catalogue" href="/"><ArrowLeft /> Back to catalogue</Link>
    </header>

    <CampaignSlots page="product" category={product.category} product={product.code}/>
    <section className="product-detail-shell">
      <div className="product-gallery"><div className="product-detail-image"><img src={gallery} alt={product.name} /></div>{product.images.length>1&&<div className="product-gallery-thumbs">{product.images.map((url,i)=><button key={url} onClick={()=>setGallery(url)} aria-label={`View image ${i+1}`}><img src={url} alt=""/></button>)}</div>}</div>
      <div className="product-detail-copy">
        <span className="product-detail-code">{product.brand || product.category} · {product.code}</span>
        <h1>{product.name}</h1>
        {product.description && <div className="product-rich-description" dangerouslySetInnerHTML={{__html:product.descriptionHtml}}/>}
        <div className="product-detail-price">From R{formatPrice(priceCents)} each* <small>Product only</small></div>
        <div className="product-detail-facts">
          {product.minimumQuantity>0&&<span><small>Minimum order</small>{product.minimumQuantity}</span>}
          <span><small>Stock across variants</small>{stock.toLocaleString("en-ZA")} units available</span>
        </div>

        <AddProduct product={product} variants={variants}/>
        <a className="product-detail-secondary" href={quoteUrl} target="_blank" rel="noreferrer">Prefer to chat? Contact us on WhatsApp</a>
        <div className="share-actions"><a href={`https://wa.me/?text=${encodeURIComponent(`${shareMessage}${pageUrl}`)}`} target="_blank" rel="noreferrer"><MessageCircle /> Share on WhatsApp</a><button onClick={copyLink}>{copied ? <Check /> : <Copy />}{copied ? "Link copied" : "Copy product link"}</button></div>
        <small className="detail-fine-print">Stock is based on the latest supplier update and is confirmed when we quote. Branding, setup and delivery are quoted separately.</small>
      </div>
    </section>

    {related.length > 0 && <section className="related-products"><div className="related-heading"><span>KEEP EXPLORING</span><h2>Related products</h2></div><div className="related-grid">{related.map((item) => <a href={`/product/${encodeURIComponent(item.code)}`} key={item.code}><div><img src={item.image} alt={item.name} /><span>{item.category}</span></div><small>{item.code}</small><h3>{item.name}</h3><strong>From R{formatPrice(item.priceCents)} ea*</strong><ArrowUpRight /></a>)}</div></section>}

    <footer className="product-page-footer"><img src="/gentwelve-web-logo-w.svg" alt="Gentwelve Printing Co" /><p>More than ink on paper. Strategic branding, promotional products and print delivered across South Africa.</p></footer>
  </main>;
}
