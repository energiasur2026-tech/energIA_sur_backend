/** Invoice closing is an actual date, never the invoice due date or an assumed calendar month. */
export function billingRange(closedOn:string,now=new Date()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(closedOn))throw new Error('Ingresá una fecha de cierre válida.');
 const from=new Date(closedOn+'T03:00:00.000Z');
 if(!Number.isFinite(+from)||new Date(+from-10800000).toISOString().slice(0,10)!==closedOn||+from>+now||Number(closedOn.slice(0,4))<2000)throw new Error('La fecha de cierre debe ser real y no puede estar en el futuro.');
 return {from,to:now,days:Math.max(0,(+now-+from)/86400000)};
}

/** Estimate the next cycle boundary by monthly anniversary, clamping short months. */
export function estimatedBillingCycle(closedOn:string,now=new Date()) {
 const {from:start}=billingRange(closedOn,now);
 const year=start.getUTCFullYear(), month=start.getUTCMonth(), day=start.getUTCDate();
 const lastDay=new Date(Date.UTC(year,month+2,0)).getUTCDate();
 const end=new Date(Date.UTC(year,month+1,Math.min(day,lastDay),3));
 const days=(+end-+start)/86400000;
 const elapsed=Math.max(0,Math.min((+now-+start)/86400000,days));
 return {month:closedOn.slice(0,7),start,end,days,elapsed};
}
