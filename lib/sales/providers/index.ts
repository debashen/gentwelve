import {paystack} from "./paystack";
import {payfast} from "./payfast";
import {ozow} from "./ozow";
import type {OnlineProvider,PaymentAdapter} from "./types";
export const adapters:Record<OnlineProvider,PaymentAdapter>={paystack,payfast,ozow};
export function providerReadiness(){return Object.fromEntries(Object.entries(adapters).map(([key,adapter])=>[key,{configured:adapter.configured(),testMode:adapter.testMode()}]))}
