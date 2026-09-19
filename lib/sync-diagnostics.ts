import {extractProductVariants,getProductCode,normalisePrice,normaliseProduct,normaliseStock} from "./amrod";
export function sourceDiagnostics(rows:Record<string,unknown>[],dataset:string){
 const codes=new Set<string>(),variants=new Set<string>();let skipped=0,missingCode=0,missingName=0,duplicates=0,inactive=0;
 for(const row of rows){
  const normalized=dataset==="products"?normaliseProduct(row):dataset==="prices"?normalisePrice(row):normaliseStock(row);
  const code=dataset==="products"?getProductCode(row):String(row.fullCode??row.FullCode??row.code??row.Code??"");
  if(!code)missingCode++;
  if(dataset==="products"&&code&&!normalized)missingName++;
  if(!normalized)skipped++;
  if(code){if(codes.has(code))duplicates++;codes.add(code)}
  if(row.active===false||row.isActive===false||row.discontinued===true||row.isDiscontinued===true||Number(row.actionType??row.ActionType)===2)inactive++;
  if(dataset==="products")for(const v of extractProductVariants(row))variants.add(v.fullCode);
 }
 return {supplierRecords:rows.length,uniqueCodes:codes.size,variants:variants.size,skipped,missingCode,missingName,duplicates,inactive,endpoint:dataset==="products"?"/Products/GetProductsAndBranding":dataset==="prices"?"/Prices/":"/Stock/",completeResponse:true};
}
