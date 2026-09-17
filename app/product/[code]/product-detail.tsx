"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, Copy, MessageCircle } from "lucide-react";
import type { ProductPageProduct, ProductPageVariant, RelatedProduct } from "@/lib/catalogue-product";

const formatPrice = (cents: number) => Math.ceil(cents / 100).toLocaleString("en-ZA");
const quantityOptions = (minimum: number) => {
  const start = Math.max(1, minimum || 1);
  const values = [start, 25, 50, 100, 250].filter((value, index, list) => value >= start && list.indexOf(value) === index).slice(0, 4).map(String);
  if (start <= 500) values.push("500+");
  return ["Not sure", ...values];
};

export default function ProductDetail({ product, variants, related }: { product: ProductPageProduct; variants: ProductPageVariant[]; related: RelatedProduct[] }) {
  const [colour, setColour] = useState("");
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState("Not sure");
  const [copied, setCopied] = useState(false);
  const [pageUrl, setPageUrl] = useState("");
  const session = useRef("");

  const colours = useMemo(() => [...new Set(variants.filter((variant) => !size || variant.size === size).map((variant) => variant.colour).filter(Boolean))], [variants, size]);
  const sizes = useMemo(() => [...new Set(variants.filter((variant) => !colour || variant.colour === colour).map((variant) => variant.size).filter(Boolean))], [variants, colour]);
  const matching = variants.filter((variant) => (!colour || variant.colour === colour) && (!size || variant.size === size));
  const stock = matching.reduce((total, variant) => total + variant.stock, 0);
  const priceCents = matching.length ? Math.min(...matching.map((variant) => variant.priceCents)) : product.priceCents;
  const selection = [colour && `colour ${colour}`, size && `size ${size}`].filter(Boolean).join(", ");
  const enquiry = quantity === "Not sure"
    ? `Hi Gentwelve, I'm interested in ${product.name} (${product.code})${selection ? `, ${selection}` : ""}. Please advise on a suitable quantity and branding options.`
    : `Hi Gentwelve, I'm interested in ${product.name} (${product.code})${selection ? `, ${selection}` : ""}. Please quote me for ${quantity} units branded with our logo.`;

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
  const quoteUrl = `https://wa.me/27690451055?text=${encodeURIComponent(enquiry)}`;

  return <main className="product-page">
    <header className="product-page-header">
      <Link href="/" aria-label="Gentwelve catalogue"><img src="/gentwelve-web-logo-w.svg" alt="Gentwelve Printing Co" /></Link>
      <Link className="back-to-catalogue" href="/"><ArrowLeft /> Back to catalogue</Link>
    </header>

    <section className="product-detail-shell">
      <div className="product-detail-image"><img src={product.image} alt={product.name} /></div>
      <div className="product-detail-copy">
        <span className="product-detail-code">{product.brand || product.category} · {product.code}</span>
        <h1>{product.name}</h1>
        {product.description && <p className="product-description">{product.description}</p>}
        <div className="product-detail-price">From R{formatPrice(priceCents)} each* <small>Product only</small></div>
        <div className="product-detail-facts">
          <span><small>Minimum order</small>{product.minimumQuantity || "Ask us"}</span>
          <span><small>{selection ? "Selected stock" : "Stock across variants"}</small>{stock.toLocaleString("en-ZA")} units available</span>
        </div>

        {colours.length > 0 && <div className="detail-option-group"><p>Choose a colour</p><div className="variant-options"><button className={!colour ? "active" : ""} onClick={() => setColour("")}>Any colour</button>{colours.map((value) => <button className={colour === value ? "active" : ""} onClick={() => setColour(value)} key={value}>{value}</button>)}</div></div>}
        {sizes.length > 0 && <div className="detail-option-group"><p>Choose a size</p><div className="variant-options"><button className={!size ? "active" : ""} onClick={() => setSize("")}>Any size</button>{sizes.map((value) => <button className={size === value ? "active" : ""} onClick={() => setSize(value)} key={value}>{value}</button>)}</div></div>}
        {product.methods.length > 0 && <div className="detail-option-group"><p>Available branding methods</p><div className="methods">{product.methods.map((method) => <span key={method}>{method}</span>)}</div></div>}
        <fieldset className="detail-quantity"><legend>How many do you need?</legend><div className="quantities">{quantityOptions(product.minimumQuantity).map((value) => <button className={quantity === value ? "active" : ""} onClick={() => setQuantity(value)} key={value}>{value}</button>)}</div></fieldset>
        <a className="quote-button" href={quoteUrl} target="_blank" rel="noreferrer" onClick={() => { try { void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventType: "whatsapp_click", productCode: product.code, quantity, sessionId: session.current }), keepalive: true }).catch(()=>{}); } catch {} }}><MessageCircle /> Get a branded quote</a>
        <div className="share-actions"><a href={`https://wa.me/?text=${encodeURIComponent(`${shareMessage}${pageUrl}`)}`} target="_blank" rel="noreferrer"><MessageCircle /> Share on WhatsApp</a><button onClick={copyLink}>{copied ? <Check /> : <Copy />}{copied ? "Link copied" : "Copy product link"}</button></div>
        <small className="detail-fine-print">Stock is based on the latest supplier update and is confirmed when we quote. Branding, setup and delivery are quoted separately.</small>
      </div>
    </section>

    {related.length > 0 && <section className="related-products"><div className="related-heading"><span>KEEP EXPLORING</span><h2>Related products</h2></div><div className="related-grid">{related.map((item) => <a href={`/product/${encodeURIComponent(item.code)}`} key={item.code}><div><img src={item.image} alt={item.name} /><span>{item.category}</span></div><small>{item.code}</small><h3>{item.name}</h3><strong>From R{formatPrice(item.priceCents)} ea*</strong><ArrowUpRight /></a>)}</div></section>}

    <footer className="product-page-footer"><img src="/gentwelve-web-logo-w.svg" alt="Gentwelve Printing Co" /><p>More than ink on paper. Strategic branding, promotional products and print delivered across South Africa.</p></footer>
  </main>;
}
