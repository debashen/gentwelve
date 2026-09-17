import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProductPageData } from "@/lib/catalogue-product";
import ProductDetail from "./product-detail";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const data = await getProductPageData(code);
  if (!data) return { title: "Product unavailable | Gentwelve Printing Co" };

  const { product } = data;
  const description = `Explore ${product.name} from Gentwelve Printing Co. View indicative pricing, current stock and available branding methods, then request a branded quote.`;
  return {
    title: `${product.name} | Gentwelve Printing Co`,
    description,
    alternates: { canonical: `/product/${encodeURIComponent(product.code)}` },
    openGraph: { title: product.name, description, type: "website", images: [] },
    twitter: { title: product.name, description, images: [] },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { code } = await params;
  const data = await getProductPageData(code);
  if (!data) notFound();
  return <ProductDetail {...data} />;
}
