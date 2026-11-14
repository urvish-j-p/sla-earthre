'use client';

import { Button, Progress, Table, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { availabilityColor } from '@/lib/colors';
import { fmtInt, fmtMinutes, fmtMs, fmtPct, fmtUtc } from '@/lib/format';

/** Per-service SLA position over the whole window. */
export default function ServicesTable({ stats, onDrillDown }) {
  const { services, config, window } = stats;
  const firstDay = window.start.slice(0, 10);
  const lastDay = dayjs.utc(window.end).subtract(1, 'day').format('YYYY-MM-DD');

  return (
    <Table
      size="middle"
      rowKey="serviceId"
      dataSource={services}
      pagination={false}
      // size columns to their content and scroll sideways on narrow screens, never squash/overlap
      scroll={{ x: 'max-content' }}
      columns={[
        {
          title: 'Service',
          dataIndex: 'serviceName',
          fixed: 'left',
          render: (name, s) => (
            <div className="whitespace-nowrap">
              <div className="font-medium">{name}</div>
              <code className="text-[11px] text-slate-500">{s.serviceId}</code>
            </div>
          ),
        },
        {
          title: 'Availability',
          dataIndex: 'availabilityPct',
          sorter: (a, b) => (a.availabilityPct ?? 0) - (b.availabilityPct ?? 0),
          render: (pct, s) => (
            <div className="whitespace-nowrap">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: availabilityColor(pct) }} />
                <span className={`tabular font-semibold ${s.breached ? 'text-red-600' : 'text-green-700'}`}>{fmtPct(pct)}</span>
              </div>
              {s.breached ? <Tag color="red" className="mt-1!">Breach</Tag> : <Tag color="green" className="mt-1!">Met</Tag>}
            </div>
          ),
        },
        {
          title: 'Downtime',
          dataIndex: 'downtimeMinutes',
          sorter: (a, b) => a.downtimeMinutes - b.downtimeMinutes,
          render: (m, s) => (
            <div className="tabular whitespace-nowrap">
              {fmtMinutes(m)}
              <div className="text-xs text-slate-500">{fmtInt(s.down)} failed checks</div>
            </div>
          ),
        },
        {
          title: (
            <Tooltip title={`Allowed downtime at ${config.targetPct}% over the checks observed, and how much of it is used.`}>
              Error budget
            </Tooltip>
          ),
          dataIndex: 'budgetUsedPct',
          width: 200,
          sorter: (a, b) => (a.budgetUsedPct ?? 0) - (b.budgetUsedPct ?? 0),
          render: (used, s) => (
            <div className="min-w-44">
              <Progress
                percent={Math.min(100, used ?? 0)}
                showInfo={false}
                size="small"
                status={used > 100 ? 'exception' : 'normal'}
              />
              <div className="tabular whitespace-nowrap text-xs text-slate-500">
                {used === null ? '–' : `${fmtInt(Math.round(used))}% of ${s.allowedDowntimeMinutes} min used`}
              </div>
            </div>
          ),
        },
        {
          title: (
            <Tooltip title="Incidents (sustained outages) vs isolated failures (background 5xx noise)">Incidents / isolated</Tooltip>
          ),
          key: 'incidents',
          render: (_, s) => (
            <span className="tabular whitespace-nowrap">
              <span className={s.incidentCount ? 'font-semibold text-red-600' : ''}>{s.incidentCount}</span>
              <span className="text-slate-400"> / </span>
              {fmtInt(s.isolatedFailures)}
            </span>
          ),
        },
        {
          title: 'Latency p50 / p95',
          key: 'latency',
          render: (_, s) => (
            <Tooltip title={`p99 ${fmtMs(s.latency.p99)} · max ${fmtMs(s.latency.max)} · ${fmtInt(s.latency.samples)} samples`}>
              <span className="tabular whitespace-nowrap">
                {fmtInt(s.latency.p50)} / {fmtMs(s.latency.p95)}
              </span>
            </Tooltip>
          ),
        },
        {
          title: 'Last check',
          key: 'last',
          render: (_, s) => (
            <div className="whitespace-nowrap">
              <Tag color={s.lastCheck.outcome === 'UP' ? 'green' : s.lastCheck.outcome === 'DOWN' ? 'red' : 'default'}>
                {s.lastCheck.outcome}
              </Tag>
              <div className="text-xs text-slate-500">{fmtUtc(s.lastCheck.at, 'DD MMM HH:mm')}</div>
            </div>
          ),
        },
        {
          title: 'Coverage',
          dataIndex: 'coveragePct',
          render: (c) => <span className={`tabular ${c < 100 ? 'text-amber-600' : 'text-slate-600'}`}>{c}%</span>,
        },
        {
          title: '',
          key: 'actions',
          fixed: 'right',
          render: (_, s) => (
            <Button
              size="small"
              disabled={!s.down}
              onClick={() => onDrillDown({ from: firstDay, to: lastDay, services: [s.serviceId], outcomes: ['DOWN'] })}
            >
              Failures
            </Button>
          ),
        },
      ]}
    />
  );
}
