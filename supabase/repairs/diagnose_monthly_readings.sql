-- Read-only diagnosis: current month in Argentine time, no inferred consumption.
select m.device_id, m.name,
 count(r.id) as samples_this_month,
 max(r.recorded_at) as last_stored_at,
 max(r.recorded_at) filter (where r.total_energy_kwh is not null and r.total_energy_kwh >= 0) as last_energy_at
from public.meters m
left join public.readings r on r.device_id=m.device_id
 and r.recorded_at >= (date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires')
 and r.recorded_at <= now()
group by m.device_id, m.name
order by m.name;
