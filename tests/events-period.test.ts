import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const start = '2026-11-01T03:00:00.000Z';
const end = '2026-11-19T03:00:00.000Z';

function row(id: number, started_at: string, ended_at: string | null = started_at, device_id = 'meter-a') {
  return { id, device_id, type: 'OVERCURRENT', severity: 'WARNING', started_at, ended_at,
    last_violation_at: started_at, samples: 1, detection_threshold: 15 };
}
const rows = [
  ...Array.from({ length: 510 }, (_, i) => row(i + 1, new Date(Date.parse(start) + i * 60000).toISOString())),
  row(511, '2026-11-01T02:00:00.000Z', '2026-11-01T04:00:00.000Z'),
  row(512, end),
  row(513, '2026-11-18T22:00:00.000Z', '2026-11-19T04:00:00.000Z'),
  row(514, '2026-11-18T23:00:00.000Z', null),
  row(515, '2026-11-18T21:00:00.000Z', null, 'meter-b'),
  row(516, start),
];

mock.module('../src/lib/supabase.ts', { namedExports: {
  supabase: () => ({
    from: () => {
      let selected = [...rows];
      const query = {
        select: () => query,
        eq: (column: keyof typeof rows[number], value: unknown) => {
          selected = selected.filter((r) => r[column] === value);
          return query;
        },
        gte: (_column: 'started_at', value: string) => {
          selected = selected.filter((r) => r.started_at >= value);
          return query;
        },
        lt: (column: 'started_at' | 'id', value: string | number) => {
          selected = selected.filter((r) => r[column] < value);
          return query;
        },
        order: (column: 'id') => {
          selected.sort((a, b) => b[column] - a[column]);
          return query;
        },
        limit: async (size: number) => ({ data: selected.slice(0, size), error: null }),
      };
      return query;
    },
  }),
} });

const { listPeriodEvents } = await import('../src/lib/events.ts');

test('shared period query paginates, scopes to the meter and counts each episode by its start', async () => {
  const events = await listPeriodEvents('meter-a', start, end);
  assert.equal(events.length, 512);
  assert.deepEqual(events.slice(0, 2).map((event) => event.id), [514, 513]);
  assert.equal(events[0].endedAt, null);
  assert.equal(events[1].endedAt, '2026-11-19T04:00:00.000Z');
  assert.equal(events.at(-1)?.id, 516);
  assert.equal(events.at(-1)?.detectionThreshold, 15);
  assert.ok(!events.some((event) => [1, 511, 512, 515].includes(event.id)));
});

mock.module('../src/lib/api-auth.ts', { namedExports: {
  meterIdFrom: (request: Request) => new URL(request.url).searchParams.get('deviceId'),
  requireMeter: async (deviceId: string) => ({
    meter: { deviceId, collectionIntervalMinutes: 15,
      thresholds: { lowVoltageV: 202.4, highVoltageV: 237.6, overcurrentA: 16, gapMinutes: 15 } },
  }),
  isErrorResponse: () => false,
} });
mock.module('../src/infrastructure/supabase-repositories.ts', { namedExports: {
  supabaseRepositories: { events: { list: async () => [] } },
} });

const { GET } = await import('../src/app/api/meter/events/route.ts');

test('Events API returns the exact Monitor bounds and the meter’s effective thresholds', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-20T03:00:00.000Z') });
  const query = new URLSearchParams({ period: 'current', from: start, to: end, deviceId: 'meter-a' });
  const response = await GET(new Request(`http://localhost/api/meter/events?${query}`));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.bounds.from, start);
  assert.equal(payload.bounds.to, end);
  assert.equal(payload.events.length, 512);
  assert.equal(payload.events[0].detectionThreshold, 15);
  assert.equal(payload.thresholds.overcurrentA, 16);
  assert.equal(payload.effectiveGapMinutes, 23);

  query.set('period', 'custom');
  query.set('from', '2026-11-19');
  query.set('to', '2026-11-18');
  const invalid = await GET(new Request(`http://localhost/api/meter/events?${query}`));
  assert.equal(invalid.status, 400);
});
