/** Invoice closing is an actual date, never the invoice due date or an assumed calendar month. */
export function billingRange(closedOn:string,now=new Date()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(closedOn))throw new Error('Ingresá una fecha de cierre válida.');
 const from=new Date(closedOn+'T03:00:00.000Z');
 if(!Number.isFinite(+from)||new Date(+from-10800000).toISOString().slice(0,10)!==closedOn||+from>+now||Number(closedOn.slice(0,4))<2000)throw new Error('La fecha de cierre debe ser real y no puede estar en el futuro.');
 return {from,to:now,days:Math.max(0,(+now-+from)/86400000)};
}
