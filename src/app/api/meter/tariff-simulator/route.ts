import {NextResponse} from 'next/server';
import {calculateElectricity, cents, TARIFFS} from '@/domain/electricity-billing';

const catalog = TARIFFS.filter(tariff => tariff.effectiveFrom !== null);

export function GET() {
  return NextResponse.json(catalog.map(({id, provider, jurisdiction, category, segment, effectiveFrom, effectiveTo, reviewedOn}) =>
    ({id, provider, jurisdiction, category, segment, effectiveFrom, effectiveTo, reviewedOn})));
}

export async function POST(request:Request) {
  const raw = await request.text();
  if (raw.length > 2048) return NextResponse.json({error:'Solicitud demasiado grande.'},{status:413});
  const input = await Promise.resolve().then(()=>JSON.parse(raw)).catch(()=>null);
  const tariff = catalog.find(item=>item.id===input?.id && item.jurisdiction===input?.jurisdiction);
  const scenarios:unknown = input?.scenarios;
  if (!tariff || !Array.isArray(scenarios) || scenarios.length<1 || scenarios.length>2 ||
    scenarios.some(kwh=>typeof kwh!=='number'||!Number.isFinite(kwh)||kwh<0||kwh>1000000)) {
    return NextResponse.json({error:'Elegí un cuadro publicado y uno o dos consumos válidos.'},{status:400});
  }
  const construction = input.construction===true && tariff.provider==='COOPRG';
  const amount:unknown = input.constructionAmount;
  if (amount!==undefined && (!construction || typeof amount!=='number' || !Number.isFinite(amount) || amount<0 || amount>100000000)) {
    return NextResponse.json({error:'El importe declarado de luz de obra no es válido.'},{status:400});
  }
  const withConstruction = !construction ? tariff : typeof amount==='number'
    ? {...tariff,additionalCharges:[...(tariff.additionalCharges??[]),{
      id:'construction',label:'Luz de obra · importe declarado',amount,source:'Declaración para la simulación',
    }],pendingNotes:[...(tariff.pendingNotes??[]),'Se usa el mismo importe declarado en ambos escenarios.']}
    : {...tariff,pendingNotes:[...(tariff.pendingNotes??[]),'Luz de obra declarada. Falta verificar su base y alícuota para este suministro.']};
  const kw:unknown = input.contractedKw;
  if (kw!==undefined && (tariff.contractedPowerRate===undefined || typeof kw!=='number' || !Number.isFinite(kw) || kw<=10 || kw>=50)) {
    return NextResponse.json({error:'T2P requiere una potencia contratada mayor a 10 y menor a 50 kW.'},{status:400});
  }
  const definition = typeof kw==='number' && tariff.contractedPowerRate!==undefined
    ? {...withConstruction,additionalCharges:[...(withConstruction.additionalCharges??[]),{
      id:'contracted-power',label:'Potencia contratada',amount:kw*tariff.contractedPowerRate,source:tariff.source,
    }],pendingNotes:withConstruction.pendingNotes?.filter(note=>!tariff.pendingNotes?.includes(note))}
    : withConstruction;
  const quotes = scenarios.map(kwh=>calculateElectricity(kwh,tariff.referenceDays,definition));
  return NextResponse.json({quotes,difference:quotes.length===2?cents(quotes[1].knownTotal-quotes[0].knownTotal):null});
}
