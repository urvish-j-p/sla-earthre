'use client';

import { Button, Empty, Table, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { fmtMinutes, fmtMs, fmtUtc } from '@/lib/format';

/** Swim-lane timeline: one lane per service across the whole window. */
function Timeline({ stats, onSelect }) {
  const { window, services, incidents, daily } = stats;
  const ws = Date.parse(window.start);
  const span = Date.parse(window.end) - ws;
  const pos = (iso) => ((Date.parse(iso) - ws) / span) * 100;
  const tickEvery = Math.ceil(daily.days.length / 10);

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="relative ml-24 h-5 sm:ml-[130px]">
        {daily.days.map((d, i) =>
          i % tickEvery === 0 ? (
            <span key={d} className="absolute -translate-x-1/2 text-[10px] text-slate-500" style={{ left: `${(i / daily.days.length) * 100}%` }}>
              {dayjs.utc(d).format('MMM D')}
            </span>
          ) : null,
        )}
      </div>
      {services.map((s) => (
        <div key={s.serviceId} className="flex items-center">
          <div className="w-24 shrink-0 truncate pr-2 text-xs sm:w-[130px] font-medium text-slate-700">{s.serviceName}</div>
          <div className="relative my-1 h-6 flex-1 rounded bg-green-100">
            {incidents
              .filter((i) => i.serviceId === s.serviceId)
              .map((i) => (
                <Tooltip key={i.id} title={`${fmtUtc(i.start)} UTC · ${fmtMinutes(i.durationMinutes)} · ${i.failedChecks} failed checks`}>
                  <button
                    type="button"
                    onClick={() => onSelect(i)}
                    className="absolute top-0 h-6 min-w-[6px] cursor-pointer rounded bg-red-500 hover:bg-red-700"
                    style={{ left: `${pos(i.start)}%`, width: `${Math.max(0.4, pos(i.end) - pos(i.start))}%` }}
                    aria-label={`Incident on ${s.serviceName} at ${i.start}`}
                  />
                </Tooltip>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Sustained outages, what they looked like and how long they lasted. */
export default function IncidentsPanel({ stats, onDrillDown }) {
  const { incidents, config } = stats;

  const inspect = (i) =>
    onDrillDown({
      from: i.start.slice(0, 10),
      to: dayjs.utc(i.end).subtract(1, 'ms').format('YYYY-MM-DD'),
      services: [i.serviceId],
    });

  return (
    <div className="space-y-4">
      <p className="m-0 text-sm text-slate-600">
        An incident is a run of at least {config.incident.minFailedChecks} failed checks with no more than{' '}
        {config.incident.maxHealthyGap} healthy checks between failures, where failures are the majority of the run. Real
        outages in this data flap (5xx bursts with the odd 200 in between), so counting only back-to-back failures would
        split one outage into several. Failures outside incidents still count towards the SLA.
      </p>

      <Timeline stats={stats} onSelect={inspect} />

      {incidents.length === 0 ? (
        <Empty description="No sustained outages detected. All failures were isolated." />
      ) : (
        <Table
          size="middle"
          rowKey="id"
          dataSource={incidents}
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Service', dataIndex: 'serviceName', render: (n, i) => <span className="font-medium">{n}</span> },
            {
              title: 'Started (UTC)',
              dataIndex: 'start',
              sorter: (a, b) => Date.parse(a.start) - Date.parse(b.start),
              defaultSortOrder: 'descend',
              render: (t) => fmtUtc(t),
            },
            { title: 'Ended (UTC)', dataIndex: 'end', render: (t) => fmtUtc(t) },
            {
              title: 'Duration',
              dataIndex: 'durationMinutes',
              sorter: (a, b) => a.durationMinutes - b.durationMinutes,
              render: (m) => <span className="tabular font-semibold">{fmtMinutes(m)}</span>,
            },
            {
              title: 'Failed checks',
              key: 'failed',
              render: (_, i) => (
                <span className="tabular">
                  {i.failedChecks} / {i.totalChecks}
                  <span className="text-slate-500"> ({Math.round(i.failureRatio * 100)}%)</span>
                </span>
              ),
            },
            {
              title: 'Status codes',
              dataIndex: 'statusCodes',
              render: (codes) =>
                Object.entries(codes).map(([code, n]) => (
                  <Tag key={code} color="red">
                    {code} × {n}
                  </Tag>
                )),
            },
            { title: 'Peak latency', dataIndex: 'peakLatencyMs', render: (v) => <span className="tabular">{fmtMs(v)}</span> },
            {
              title: '',
              key: 'go',
              render: (_, i) => (
                <Button size="small" onClick={() => inspect(i)}>
                  Inspect logs
                </Button>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
