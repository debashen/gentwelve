// Only explicitly selected, customer-safe supplier fields leave the server.
export type BrandingOption={method:string;code:string;position:string;positionCode:string;colours:string;width:string;height:string;multiplier:number};
export function brandingOptions(raw:Record<string,unknown>):BrandingOption[]{
 const result:BrandingOption[]=[];
 const positions=raw.brandings??raw.Brandings;
 if(Array.isArray(positions))for(const p of positions){if(!p||typeof p!=="object")continue;
 for(const m of Array.isArray(p.method)?p.method:[]){if(!m?.brandingName)continue;result.push({method:String(m.brandingName).trim(),code:String(m.brandingCode||""),position:String(p.positionName||"").trim(),positionCode:String(p.positionCode||""),colours:String(m.numberOfColours||""),width:String(m.maxPrintingSizeWidth||""),height:String(m.maxPrintingSizeHeight||""),multiplier:Math.max(1,Number(p.positionMultiplier)||1)*Math.max(1,Number(m.brandingMultiplier)||1)})}}
 return result;
}
