import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { isErrorResponse, meterIdFrom, requireMeter } from '@/lib/api-auth';
import { RANGES, resolveRange } from '@/domain/ranges';
import { supabaseRepositories as repos } from '@/infrastructure/supabase-repositories';

export async function GET(request: Request) {
  try {
    const meter = await requireMeter(meterIdFrom(request));
    if (isErrorResponse(meter)) return meter;

    const key = resolveRange(new URL(request.url).searchParams.get('range'));
    const range = RANGES[key];

    const to = new Date();
    const from = new Date(to.getTime() - range.seconds * 1000);

    const [series, summary] = await Promise.all([
      repos.readings.series(meter.meter.deviceId, from, to, range.bucket),
      repos.readings.summary(meter.meter.deviceId, from, to),
    ]);

    return NextResponse.json({
      range: key,
      label: range.label,
      bucketSeconds: range.bucket,
      from: from.toISOString(),
      to: to.toISOString(),
      summary,
      series,
    });
  } catch (error) {
    return apiError('api/meter/history', error);
  }
}
