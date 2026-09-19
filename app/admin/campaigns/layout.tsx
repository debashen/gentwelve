import {requireChatGPTUser} from "@/app/chatgpt-auth";
import "../sales/sales.css";
import "@/app/components/campaigns/campaigns.css";
export const dynamic="force-dynamic";
export default async function Layout({children}:{children:React.ReactNode}){await requireChatGPTUser("/admin/campaigns");return <main className="sales-app"><header className="sales-header"><a href="/admin/sales"><img src="/gentwelve-web-logo-w.svg" alt="Gentwelve"/></a><nav><a href="/admin/sales">Sales</a><a href="/admin/campaigns">Campaigns</a><a href="/admin/catalogue">Catalogue</a></nav></header>{children}</main>}
