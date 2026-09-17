import { requireChatGPTUser } from "@/app/chatgpt-auth";
import AnalyticsDashboard from "./dashboard";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage(){
 await requireChatGPTUser("/admin/analytics");
 return <main className="admin-page analytics-admin"><div className="admin-brand"><img src="/gentwelve-web-logo-w.svg" alt="Gentwelve Printing Co"/><span>ENQUIRY INTELLIGENCE</span></div><AnalyticsDashboard/></main>;
}
