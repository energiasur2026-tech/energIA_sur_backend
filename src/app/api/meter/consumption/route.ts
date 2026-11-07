import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { isErrorResponse, requireMeter } from '@/lib/api-auth';
import { PERIODS, periodRange, resolvePeriod } from '@/domain/periods';

import { estimateEnergyCost } from '@/domain/tariffs';
import { includesFixedCharge } from '@/domain/meter-role';
import { supabaseRepositories as repos } from '@/infrastructure/supabase-repositories';

/**
 * Consumo real y costo estimado de energía para un período.
 *
 * El consumo sale de la diferencia entre la energía acumulada al inicio y al
 * final del período (ambas reportadas por el medidor). Si no hay al menos
 * dos lecturas reales en el rango, o el contador retrocedió (medidor
 * reiniciado o reemplazado), no se estima nada: se informa por qué.
 */
export async function GET(request: Request) {
  try {
    const meter = await requireMeter();
    if (isErrorResponse(meter)) return meter;

    const key = resolvePeriod(new URL(request.url).searchParams.get('period'));
    const { from, to, days } = periodRange(key);

    const consumption = await repos.readings.periodConsumption(meter.meter.deviceId, from, to);

    const base = {
      role: meter.meter.role,
      /** `false` en un medidor de área: el costo no incluye el cargo fijo. */
      billable: includesFixedCharge(meter.meter.role),
      period: key,
      label: PERIODS[key].label,
      from: from.toISOString(),
      to: to.toISOString(),
      samples: consumption.samples,
      firstAt: consumption.firstAt,
      lastAt: consumption.lastAt,
    };

    const hasEnoughData =
      consumption.samples >= 2 &&
      consumption.firstEnergy !== null &&
      consumption.lastEnergy !== null &&
      consumption.lastEnergy >= consumption.firstEnergy;

    if (!hasEnoughData) {
      return NextResponse.json({
        ...base,
        available: false,
        reason:
          consumption.samples < 2
            ? 'insufficient_readings'
            : 'meter_counter_decreased',
        consumedKwh: null,
        cost: null,
      });
    }

    const consumedKwh = round(consumption.lastEnergy! - consumption.firstEnergy!, 3);
    // Un medidor de área no lleva cargo fijo: se paga una vez por
    // instalación, no por lugar. Su costo es informativo —cuánto de la
    // factura explica ese lugar— y no una factura aparte.
    const cost = estimateEnergyCost(consumedKwh, days, includesFixedCharge(meter.meter.role));

    return NextResponse.json({
      ...base,
      available: true,
      reason: null,
      consumedKwh,
      cost,
    });
  } catch (error) {
    return apiError('api/meter/consumption', error);
  }
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
