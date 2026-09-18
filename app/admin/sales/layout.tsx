import { requireChatGPTUser } from "@/app/chatgpt-auth";
import "./sales.css";
export const dynamic="force-dynamic";
export default async function SalesLayout({children}:{children:React.ReactNode}){
  await requireChatGPTUser("/admin/sales");
  return <main className="sales-app"><header className="sales-header"><a href="/admin/sales"><img src="/gentwelve-web-logo-w.svg" alt="Gentwelve"/></a><nav aria-label="Sales navigation"><a href="/admin/sales">Sales</a><a href="/admin/sales/customers">Customers</a><a href="/admin/sales/settings">Settings</a><a href="/admin/catalogue">Catalogue</a></nav></header>{children}</main>;
}
