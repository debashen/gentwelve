import { requireChatGPTUser } from "@/app/chatgpt-auth";
import ImportPanel from "./import-panel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireChatGPTUser("/admin");
  return <main className="admin-page"><div className="admin-brand"><img src="/gentwelve-web-logo-w.svg" alt="Gentwelve Printing Co"/><span>CATALOGUE CONTROL</span></div><ImportPanel/></main>;
}
