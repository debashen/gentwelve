import QuoteEditor from "./quote-editor";
export default async function NewQuote({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){const p=await searchParams;return <QuoteEditor customerId={p.customer} enquiryId={p.enquiry} editId={p.edit}/>}
