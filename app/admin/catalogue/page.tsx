import { requireChatGPTUser } from "@/app/chatgpt-auth";
import CatalogueReview from "./review";

export const dynamic = "force-dynamic";

export default async function CataloguePage(){
  await requireChatGPTUser("/admin/catalogue");
  return <main className="admin-page catalogue-admin"><div className="admin-brand"><img src="/gentwelve-web-logo-w.svg" alt="Gentwelve Printing Co"/><span>CATALOGUE REVIEW</span></div><CatalogueReview/></main>;
}
