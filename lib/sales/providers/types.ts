export type OnlineProvider="paystack"|"payfast"|"ozow";
export type CheckoutInput={reference:string;amountCents:number;email:string;customerName:string;orderNumber:string;returnUrl:string;notifyUrl:string;testMode:boolean};
export type Checkout={type:"redirect";url:string}|{type:"form";url:string;fields:Record<string,string>}|{type:"payfast";uuid:string;scriptUrl:string};
export type VerifiedPayment={reference:string;providerReference:string;amountCents:number;currency:string;status:"succeeded"|"failed"|"cancelled";testMode:boolean;paidAt:string|null};
export interface PaymentAdapter{configured():boolean;testMode():boolean;start(input:CheckoutInput):Promise<Checkout>;verify(raw:string,headers:Headers):Promise<VerifiedPayment|null>}
