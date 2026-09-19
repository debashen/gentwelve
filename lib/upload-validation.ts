export const MAX_ARTWORK_BYTES=3000000;
export function validateArtwork(name:string,bytes:Buffer){
 if(!bytes.length||bytes.length>MAX_ARTWORK_BYTES)throw new Error("Artwork must be between 1 byte and 3 MB.");
 const ext=name.toLowerCase().split(".").pop();const text=bytes.toString("utf8");
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const pdf=bytes.subarray(0,5).toString()==="%PDF-";const ps=text.startsWith("%!PS-Adobe-");
 if(!((ext==="png"&&png)||(["jpg","jpeg"].includes(ext||"")&&jpg)||(ext==="pdf"&&pdf)||(ext==="ai"&&(pdf||ps))||(ext==="eps"&&ps)||(ext==="svg"&&/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text))))throw new Error("Choose a valid PDF, AI, EPS, SVG, PNG or JPEG artwork file.");
 if(pdf&&/\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction)\b/i.test(text))throw new Error("Active content is not accepted in artwork PDFs.");
 if(ext==="svg"&&/(<!DOCTYPE|<!ENTITY|<\s*(script|foreignObject|iframe)|\bon\w+\s*=|(?:href|src)\s*=\s*["']\s*(?!#)|url\s*\()/i.test(text))throw new Error("SVG artwork must not contain scripts or external resources.");
 return {filename:name.replace(/[^a-zA-Z0-9._ -]/g,"_").slice(-120)||`artwork.${ext}`,contentType:png?"image/png":jpg?"image/jpeg":pdf?"application/pdf":"application/octet-stream"};
}
export function validateCampaignImage(bytes:Buffer,type:string){
 if(bytes.length>1000000||!bytes.length)throw new Error("Use a campaign image under 1 MB.");
 const valid=type==="image/png"?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):type==="image/jpeg"?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:type==="image/webp"?bytes.subarray(0,4).toString()==="RIFF"&&bytes.subarray(8,12).toString()==="WEBP":false;
 if(!valid)throw new Error("Choose a valid PNG, JPEG or WebP image.");
}
