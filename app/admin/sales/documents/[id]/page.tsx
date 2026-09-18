import Detail from "./detail";
export default async function DocumentPage({params}:{params:Promise<{id:string}>}){return <Detail id={(await params).id}/>}
