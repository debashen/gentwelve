import { randomUUID } from "node:crypto";
import { DB } from "@/lib/database";
import { businessSchema, type Business, type Customer } from "./validation";
export class SalesError extends Error { constructor(message:string, public status=400){super(message)} }
export async function audit(entityId:string,event:string,actor:string,detail:Record<string,unknown>={}){
  await DB.prepare("INSERT INTO sales_audit(entity_id,event,actor,detail) VALUES(?,?,?,?::text::jsonb)").bind(entityId,event,actor,JSON.stringify(detail)).run();
}
export async function getBusiness(){
  const row=await DB.prepare("SELECT data,version FROM sales_business_settings WHERE id='default'").first<{data:Business;version:number}>();
  if(!row)throw new SalesError("Sales settings are unavailable.",503);
  return {data:businessSchema.parse(row.data),version:row.version};
}
export async function createCustomer(data:Customer,actor:string){
  const id=randomUUID();
  await DB.prepare("INSERT INTO sales_customers(id,name,data) VALUES(?::uuid,?,?::text::jsonb)").bind(id,data.name,JSON.stringify(data)).run();
  await audit(id,"customer_created",actor);
  return id;
}
export async function getCustomer(id:string){
  const row=await DB.prepare("SELECT id,data,archived,version,created_at AS createdAt FROM sales_customers WHERE id=?::uuid").bind(id).first<{id:string;data:Customer;archived:boolean;version:number;createdAt:string}>();
  if(!row)throw new SalesError("Customer not found.",404);
  return row;
}
