import {z} from "zod";
import {selectionSchema} from "./quote-request-schema";
export const BASKET_KEY="gentwelve_quote_v1";
export const basketItemSchema=selectionSchema.extend({id:z.string().uuid(),productId:z.number().int().positive().optional(),name:z.string().max(300),image:z.string().max(2000),colour:z.string().max(100),size:z.string().max(100),priceCents:z.number().int().nonnegative().nullable()});
export type BasketItem=z.infer<typeof basketItemSchema>;
export function parseBasket(value:string|null):BasketItem[]{try{return z.array(basketItemSchema).max(30).parse(JSON.parse(value||"[]"))}catch{return []}}
