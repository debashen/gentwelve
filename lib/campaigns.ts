import {z} from "zod";
export const displayTypes=["popup","announcement","hero","product"] as const;
const destination=z.string().min(1).max(500).refine(v=>v.startsWith("/")&&!v.startsWith("//")&&!/[\\\r\n]/.test(v),"Use a catalogue path beginning with /.");
const image=z.union([z.literal(""),z.string().regex(/^\/api\/campaign-assets\/[0-9a-f-]{36}$/)]).default("");
export const campaignSchema=z.object({
 name:z.string().trim().min(1).max(120),enabled:z.boolean().default(false),published:z.boolean().default(false),headline:z.string().trim().min(1).max(160),text:z.string().trim().max(600).default(""),desktopImage:image,mobileImage:image,ctaLabel:z.string().trim().min(1).max(60).default("Explore"),ctaDestination:destination.default("/"),startsAt:z.string().datetime().nullable().default(null),endsAt:z.string().datetime().nullable().default(null),priority:z.number().int().min(-100).max(100).default(0),types:z.array(z.enum(displayTypes)).min(1).max(4),target:z.enum(["all","home","browse","categories","products"]).default("all"),categories:z.array(z.string().min(1).max(200)).max(50).default([]),products:z.array(z.string().min(1).max(200)).max(100).default([]),frequency:z.enum(["visit","session","days","campaign"]).default("session"),frequencyDays:z.number().int().min(1).max(365).default(7)
}).strict().superRefine((v,c)=>{if(v.startsAt&&v.endsAt&&v.endsAt<=v.startsAt)c.addIssue({code:"custom",path:["endsAt"],message:"End must be after start."});if(v.target==="categories"&&!v.categories.length)c.addIssue({code:"custom",path:["categories"],message:"Choose at least one category."});if(v.target==="products"&&!v.products.length)c.addIssue({code:"custom",path:["products"],message:"Choose at least one product."})});
export type Campaign=z.infer<typeof campaignSchema>;
export type CampaignRecord={id:string;data:Campaign;version:number};
export function campaignStatus(c:Campaign,now=Date.now()){
 if(!c.published)return "Draft";if(!c.enabled)return "Disabled";if(c.endsAt&&Date.parse(c.endsAt)<=now)return "Expired";if(c.startsAt&&Date.parse(c.startsAt)>now)return "Scheduled";return "Active";
}
export function campaignMatches(c:Campaign,context:{page:"home"|"browse"|"product";category?:string;product?:string}){
 return c.target==="all"||c.target===context.page||(c.target==="categories"&&!!context.category&&c.categories.includes(context.category))||(c.target==="products"&&!!context.product&&c.products.includes(context.product));
}
export function popupEligible(c:Campaign,state:{sessionSeen?:boolean;lastSeen?:number},now=Date.now()){
 if(c.frequency==="visit")return true;if(c.frequency==="session")return !state.sessionSeen;if(c.frequency==="campaign")return !state.lastSeen;return !state.lastSeen||now-state.lastSeen>=c.frequencyDays*86400000;
}
