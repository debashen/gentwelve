import sanitizeHtml from "sanitize-html";
export function productDescriptionHtml(value:string){
 return sanitizeHtml(value,{allowedTags:["p","div","br","ul","ol","li","strong","b","em","i","h3","h4","span"],allowedAttributes:{},disallowedTagsMode:"discard",nonTextTags:["script","style","textarea","option","iframe","svg","math"]});
}
export function productImages(raw:Record<string,unknown>,fallback:string){
 const images=new Set<string>(fallback?[fallback]:[]);
 const walk=(value:unknown,depth=0)=>{if(depth>4)return;if(Array.isArray(value)){value.forEach(v=>walk(v,depth+1));return}if(!value||typeof value!=="object")return;for(const [key,v] of Object.entries(value)){if(/^(url|imageurl)$/i.test(key)&&typeof v==="string"&&/^https:\/\//i.test(v))images.add(v);else if(typeof v==="object")walk(v,depth+1)}};
 walk(raw.images??raw.Images);return [...images].slice(0,10);
}
