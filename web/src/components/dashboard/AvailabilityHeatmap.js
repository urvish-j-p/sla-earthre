'use client';

import { Tooltip } from 'antd';
import dayjs from 'dayjs';
import { AVAILABILITY_BANDS, NO_DATA_COLOR, availabilityColor } from '@/lib/colors';
import { fmtMinutes, fmtMs, fmtPct } from '@/lib/format';

/**
 * Service × day grid. Shows at a glance *when* things went wrong, which a
 * single availability number hides. Click a cell to open that day's logs.
 */
export default function AvailabilityHeatmap({ stats, onDrillDown }) {
  const { daily, incidents, config } = stats;
  const incidentDays = new Set(
    incidents.flatMap((i) => {
      const days = [];
      for (let d = dayjs.utc(i.start).startOf('day'); d.isBefore(dayjs.utc(i.end)); d = d.add(1, 'day')) {
        days.push(`${i.serviceId}|${d.format('YYYY-MM-DD')}`);
      }
      return days;
    }),
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 className="m-0 font-semibold">Daily availability</h4>
          <p className="m-0 text-xs text-slate-500">UTC days · ● = incident that day · click a cell to inspect its checks</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          {AVAILABILITY_BANDS.map((b) => (
            <span key={b.label} className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm" style={{ background: b.color }} />
              {b.label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm" style={{ background: NO_DATA_COLOR }} />
            no data
          </span>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div
          className="grid min-w-max gap-[3px]"
          style={{ gridTemplateColumns: `130px repeat(${daily.days.length}, minmax(22px, 1fr))` }}
        >
          <div />
          {daily.days.map((d, i) => (
            <div key={d} className="text-center text-[10px] leading-4 text-slate-500">
              {i === 0 || d.endsWith('-01') ? dayjs.utc(d).format('MMM D') : dayjs.utc(d).format('D')}
            </div>
          ))}

          {daily.services.map((svc) => (
            <div key={svc.serviceId} className="contents">
              <div className="truncate pr-2 text-xs font-medium leading-[26px] text-slate-700">{svc.serviceName}</div>
              {svc.cells.map((c) => {
                const hasIncident = incidentDays.has(`${svc.serviceId}|${c.date}`);
                return (
                  <Tooltip
                    key={c.date}
                    title={
                      <div className="text-xs">
                        <div className="font-semibold">
                          {svc.serviceName} · {dayjs.utc(c.date).format('ddd DD MMM YYYY')}
                        </div>
                        <div>Availability {fmtPct(c.availabilityPct)}</div>
                        <div>
                          {c.down} failed / {c.up + c.down} checks · downtime {fmtMinutes(c.down * config.slotMinutes)}
                        </div>
                        {c.unknown > 0 && <div>{c.unknown} unknown</div>}
                        <div>p95 latency {fmtMs(c.p95LatencyMs)}</div>
                        {hasIncident && <div className="font-semibold text-red-300">Incident this day</div>}
                      </div>
                    }
                  >
                    <button
                      type="button"
                      aria-label={`${svc.serviceName} ${c.date}: ${fmtPct(c.availabilityPct)}`}
                      onClick={() => onDrillDown({ from: c.date, services: [svc.serviceId] })}
                      className="relative h-[26px] cursor-pointer rounded-[4px] outline-offset-1 transition-transform hover:scale-110 hover:outline hover:outline-2 hover:outline-slate-700"
                      style={{ background: availabilityColor(c.availabilityPct) }}
                    >
                      {hasIncident && <span className="absolute inset-0 grid place-items-center text-[10px] text-white">●</span>}
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
