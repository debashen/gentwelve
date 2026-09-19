import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {DB} from "@/lib/database";
import {admin,fail,noStore} from "@/lib/sales/http";
import {limitedBody} from "@/lib/public-security";
import {validateCampaignImage} from "@/lib/upload-validation";
import {SalesError} from "@/lib/sales/store";
export async function POST(request:Request){try{await admin(request);const bytes=await limitedBody(request,1000000),type=request.headers.get("content-type")||"";
 try{validateCampaignImage(bytes,type)}catch(e){throw new SalesError((e as Error).message)}
 const id=randomUUID();await DB.prepare("INSERT INTO marketing_assets(id,content_type,bytes) VALUES(?::uuid,?,?)").bind(id,type,bytes).run();return NextResponse.json({url:`/api/campaign-assets/${id}`},{headers:noStore});
}catch(e){return fail(e)}}
