import Dashboard from "./dashboard";
export default async function Sales({searchParams}:{searchParams:Promise<{customer?:string;kind?:string;status?:string}>}){return <Dashboard initial={await searchParams}/>}
