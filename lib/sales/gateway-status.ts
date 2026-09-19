export function gatewayStatus(enabled:boolean,configured:boolean,testMode=false){
 return !enabled?"Disabled":!configured?"Not configured":testMode?"Test mode":"Ready";
}
